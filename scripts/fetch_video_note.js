#!/usr/bin/env node
/**
 * 提取单个 YouTube 视频字幕并生成笔记
 *
 * Required env:
 *   STUDY_PUSH_TOKEN   GitHub token（写权限）
 *   VIDEO_URL          YouTube 视频链接
 *
 * Optional env:
 *   STUDY_REPO         default: https://github.com/Health-525/jiangshu-study.git
 *   STUDY_DIR          default: ./_out/jiangshu-study
 *   OUT_DIR_REL        输出目录，default: youtube-daily
 *   DEEPSEEK_API_KEY
 *   GLM_API_KEY
 *   YOUTUBE_COOKIES_FILE
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

// ── 工具函数 ────────────────────────────────────────────────────

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeExec(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// ── 字幕提取 ─────────────────────────────────────────────────────

function vttToText(vtt) {
  const lines = String(vtt || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(l => {
      if (!l.trim()) return false;
      if (/^WEBVTT/.test(l)) return false;
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false;
      if (/^\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false;
      if (/^(NOTE|STYLE|REGION)(\s|$)/.test(l)) return false;
      if (/^\d+$/.test(l.trim())) return false;
      return true;
    })
    .map(l => l.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean);

  const deduped = [];
  for (const l of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== l) deduped.push(l);
  }
  return deduped.join('\n');
}

function fetchCaptions(videoUrl) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ytcap-'));
  const outTpl = path.join(tmp, '%(id)s.%(ext)s');

  const args = [
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-format', 'vtt',
    '--sub-langs', 'zh.*,en',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '--sleep-interval', '5',
    '--max-sleep-interval', '15',
    '--retry-sleep', 'http:10',
    '--remote-components', 'ejs:github',
    '-o', outTpl,
  ];

  const cookiesFile = process.env.YOUTUBE_COOKIES_FILE;
  if (cookiesFile && fs.existsSync(cookiesFile)) {
    args.push('--cookies', cookiesFile);
    console.log(`[captions] using cookies: ${cookiesFile}`);
  }

  args.push(videoUrl);
  console.log(`[captions] fetching: ${videoUrl}`);

  const r = spawnSync('yt-dlp', args, { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) {
    console.error(`[captions] yt-dlp failed:\n${(r.stderr || '').slice(0, 800)}`);
    return null;
  }

  const files = fs.readdirSync(tmp).filter(f => f.endsWith('.vtt'));
  if (files.length === 0) {
    console.log('[captions] no subtitle files found');
    return null;
  }

  // 优先选中文字幕
  const pick = files.find(f => /\.zh/i.test(f)) || files[0];
  console.log(`[captions] picked: ${pick}`);
  const text = vttToText(fs.readFileSync(path.join(tmp, pick), 'utf8'));
  if (!text.trim()) {
    console.log('[captions] subtitle is empty after cleaning');
    return null;
  }
  return text;
}

// ── 获取视频标题 ─────────────────────────────────────────────────

function fetchVideoTitle(videoUrl) {
  const r = spawnSync('yt-dlp', ['--get-title', '--no-playlist', videoUrl], {
    encoding: 'utf8', timeout: 30000,
  });
  return (r.stdout || '').trim() || '未知标题';
}

// ── LLM 分析 ──────────────────────────────────────────────────────

function openaiCompatChat({ hostname, apiPath, apiKey, model, system, user, label }) {
  const payload = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname,
        path: apiPath,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`${label}_http_${res.statusCode}: ${txt.slice(0, 400)}`));
          }
          try {
            const obj = JSON.parse(txt);
            resolve(String(obj?.choices?.[0]?.message?.content || '').trim());
          } catch {
            reject(new Error(`${label}_invalid_json`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error(`${label}_timeout`)));
    req.write(payload);
    req.end();
  });
}

async function llmAnalyze({ title, url, transcript }) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;

  const system = '你是技术内容提炼者。只根据字幕内容输出，不编造，不扩展。输出中文，简洁直接。';
  const user = [
    `标题：${title}`,
    `链接：${url}`,
    '',
    '字幕：',
    transcript,
    '',
    '请输出 Markdown，只包含以下三个部分：',
    '',
    `# ${title}`,
    '',
    '## 核心观点',
    '（3~5条，每条一句话，直接说结论，不加废话）',
    '',
    '## 关键技术/概念',
    '（列出视频涉及的核心技术点或概念，每条：名称 + 一句话说清楚是什么/有什么用）',
    '',
    '## 原文摘录',
    '（1~3句最有价值的原话，带时间点）',
  ].join('\n');

  const tasks = [];
  if (deepseekKey) {
    tasks.push(
      openaiCompatChat({
        hostname: 'api.deepseek.com',
        apiPath: '/v1/chat/completions',
        apiKey: deepseekKey,
        model: 'deepseek-chat',
        system, user,
        label: 'deepseek',
      }).then(r => ({ r, src: 'deepseek' }))
    );
  }
  if (glmKey) {
    tasks.push(
      openaiCompatChat({
        hostname: 'open.bigmodel.cn',
        apiPath: '/api/paas/v4/chat/completions',
        apiKey: glmKey,
        model: 'glm-4-flash',
        system, user,
        label: 'glm',
      }).then(r => ({ r, src: 'glm' }))
    );
  }
  if (tasks.length === 0) return null;

  const { r, src } = await Promise.any(tasks);
  console.log(`[llm] success via ${src}`);
  return r;
}

// ── 主流程 ────────────────────────────────────────────────────────

async function main() {
  const pushToken = process.env.STUDY_PUSH_TOKEN;
  if (!pushToken) throw new Error('Missing env: STUDY_PUSH_TOKEN');

  const videoUrl = process.env.VIDEO_URL;
  if (!videoUrl) throw new Error('Missing env: VIDEO_URL');

  const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';
  const studyDir = process.env.STUDY_DIR || path.join(process.cwd(), '_out', 'jiangshu-study');
  const outRel = process.env.OUT_DIR_REL || 'youtube-daily';

  // 1. 获取标题
  console.log('[title] fetching video title...');
  const title = fetchVideoTitle(videoUrl);
  console.log(`[title] ${title}`);

  // 2. 提取字幕
  const transcript = fetchCaptions(videoUrl);

  // 3. LLM 分析
  let analysisMd = null;
  if (transcript) {
    console.log('[llm] analyzing...');
    try {
      analysisMd = await llmAnalyze({ title, url: videoUrl, transcript });
    } catch (e) {
      console.log(`[llm] failed: ${e.errors ? e.errors.map(x => x.message).join(', ') : e.message}`);
    }
  } else {
    console.log('[llm] skipped: no transcript');
  }

  // 4. 构建 Markdown
  const date = todayShanghai();
  const lines = [];
  lines.push(`# 视频笔记 · ${date}`);
  lines.push('');
  lines.push(`> 来源：[${title}](${videoUrl})`);
  lines.push('');

  if (analysisMd) {
    lines.push(analysisMd);
  } else if (transcript) {
    lines.push('## 字幕原文');
    lines.push('');
    lines.push('```');
    lines.push(transcript.slice(0, 3000));
    if (transcript.length > 3000) lines.push('...（字幕过长，已截断）');
    lines.push('```');
  } else {
    lines.push('> 未能提取到字幕，请手动查看视频。');
  }
  lines.push('');

  // 5. Clone jiangshu-study 并写入文件
  ensureDir(path.dirname(studyDir));
  if (fs.existsSync(studyDir)) {
    safeExec(`rm -rf "${studyDir}"`);
  }
  const authed = repo.replace('https://', `https://x-access-token:${pushToken}@`);
  safeExec(`git clone --depth 1 "${authed}" "${studyDir}"`);

  const outDir = path.join(studyDir, outRel);
  ensureDir(outDir);

  // 文件名：日期 + 视频 ID，避免同一天多个视频覆盖
  const videoId = (videoUrl.match(/[?&]v=([^&]+)/) || [])[1] || Date.now().toString();
  const outFile = path.join(outDir, `${date}-${videoId}.md`);
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`[write] ${outFile}`);

  // 6. Commit & push
  safeExec(`git add "${outRel}"`, { cwd: studyDir });
  safeExec(
    `git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" ` +
    `commit -m "video-note: ${title.slice(0, 60)}" || true`,
    { cwd: studyDir }
  );
  safeExec('git push origin HEAD', { cwd: studyDir });
  console.log('[done] pushed to jiangshu-study');
}

main().catch(e => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
