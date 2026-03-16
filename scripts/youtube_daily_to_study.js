#!/usr/bin/env node

/**
 * Fetch daily updates from YouTube channel RSS feeds and write a daily markdown file
 * into jiangshu-study/youtube-daily/YYYY-MM-DD.md, then commit & push.
 *
 * Required env:
 *   STUDY_PUSH_TOKEN  GitHub token with repo write access to Health-525/jiangshu-study
 *
 * Optional env:
 *   STUDY_REPO   default: https://github.com/Health-525/jiangshu-study.git
 *   STUDY_DIR    default: ./_out/jiangshu-study
 *   OUT_DIR_REL  default: youtube-daily
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

function todayShanghai() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function readLines(p) {
  const txt = fs.readFileSync(p, 'utf8');
  return txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

function pickAll(re, s) {
  const out = [];
  let m;
  while ((m = re.exec(s))) out.push(m);
  return out;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseAtomEntries(xml) {
  const entries = [];
  const entryMatches = pickAll(/<entry>([\s\S]*?)<\/entry>/g, xml);
  for (const em of entryMatches) {
    const block = em[1];
    const title = escapeXml((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
    const link = ((block.match(/<link[^>]*href="([^"]+)"[^>]*>/) || [])[1] || '').trim();
    const published = ((block.match(/<published>([^<]+)<\/published>/) || [])[1] || '').trim();
    const channelTitle = escapeXml((xml.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
    if (title && link) entries.push({ title, link, published, channelTitle });
  }
  return entries;
}

async function resolveChannelId(handleUrl) {
  // If URL already contains /channel/UCxxxx, extract directly.
  const direct = handleUrl.match(/\/channel\/(UC[A-Za-z0-9_-]+)/);
  if (direct) return direct[1];

  // For @handle URLs, probe the channel page.
  const r = await httpGet(handleUrl);
  if (r.status >= 400) throw new Error(`channel_page_http_${r.status}`);

  // Try multiple patterns YouTube has used over time.
  for (const pat of [
    /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
    /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
    /\/channel\/(UC[A-Za-z0-9_-]+)/,
    /"browseId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
  ]) {
    const m = r.body.match(pat);
    if (m && m[1]) return m[1];
  }
  throw new Error(`channel_id_not_found for ${handleUrl}`);
}

function feedUrlForChannelId(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeExec(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

function vttToText(vtt) {
  const lines = String(vtt || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => {
      if (!l.trim()) return false;
      if (/^WEBVTT/.test(l)) return false;
      // 时间轴行：HH:MM:SS.mmm --> HH:MM:SS.mmm ...
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false;
      if (/^\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false;
      // NOTE/STYLE/REGION 块头
      if (/^(NOTE|STYLE|REGION)(\s|$)/.test(l)) return false;
      // 纯数字序号（SRT 风格混入）
      if (/^\d+$/.test(l.trim())) return false;
      return true;
    })
    .map((l) => l.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean);

  // YouTube 自动字幕每句会滚动重复，去重相邻相同行
  const deduped = [];
  for (const l of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== l) {
      deduped.push(l);
    }
  }
  return deduped.join('\n');
}

function tryFetchCaptions({ videoUrl }) {
  // Requires yt-dlp available in PATH (workflow will install it).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ytcap-'));
  const outTpl = path.join(tmp, '%(id)s.%(ext)s');
  const args = [
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-format', 'vtt',
    '--sub-langs', 'zh.*,en',
    // 伪装 User-Agent，降低 bot 检测概率
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '--sleep-interval', '2',
    '--max-sleep-interval', '5',
    '-o', outTpl,
    videoUrl
  ];

  const cookiesFile = process.env.YOUTUBE_COOKIES_FILE;
  if (cookiesFile && fs.existsSync(cookiesFile)) {
    args.push('--cookies', cookiesFile);
    console.log(`[captions] using cookies: ${cookiesFile}`);
  } else {
    console.log('[captions] no cookies file, may hit bot detection');
  }

  console.log(`[captions] fetching: ${videoUrl}`);
  const r = spawnSync('yt-dlp', args, { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) {
    const detail = (r.stderr || '').slice(0, 800);
    console.log(`[captions] yt_dlp_failed status=${r.status} detail=${detail}`);
    return { ok: false, reason: 'yt_dlp_failed', detail };
  }

  const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.vtt'));
  if (files.length === 0) {
    console.log(`[captions] no_captions for ${videoUrl}`);
    return { ok: false, reason: 'no_captions' };
  }

  // Prefer zh if present.
  const pick = files.find((f) => /zh/i.test(f)) || files[0];
  console.log(`[captions] picked file: ${pick}`);
  const vtt = fs.readFileSync(path.join(tmp, pick), 'utf8');
  const text = vttToText(vtt);
  if (!text.trim()) {
    console.log(`[captions] captions_empty for ${videoUrl}`);
    return { ok: false, reason: 'captions_empty' };
  }
  return { ok: true, langFile: pick, text };
}

function deepseekChat({ apiKey, system, user }) {
  // OpenAI-compatible style endpoint.
  const payload = JSON.stringify({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            return reject(new Error(`deepseek_http_${res.statusCode}: ${txt.slice(0, 400)}`));
          }
          let obj;
          try {
            obj = JSON.parse(txt);
          } catch {
            return reject(new Error('deepseek_invalid_json'));
          }
          const content = obj && obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content;
          resolve(String(content || '').trim());
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('deepseek_timeout')));
    req.write(payload);
    req.end();
  });
}

function buildTechNotesPrompt({ title, channel, url, published, transcript }) {
  const system = [
    '你是资深工程师与技术写作者。输出中文、条理清晰、偏“技术笔记”。',
    '只允许基于字幕内容总结，不得编造。遇到不确定就明确写“未提及/无法从字幕确定”。',
    '允许提炼术语解释，但必须是“字幕里出现的概念”的简短释义（不扩展到百科）。'
  ].join('\n');

  const user = [
    `标题：${title}`,
    `频道：${channel}`,
    `链接：${url}`,
    `发布时间：${published || ''}`,
    '',
    '字幕：',
    transcript,
    '',
    '请输出 Markdown，严格按以下结构（标题必须一致）：',
    '',
    `# ${title}`,
    '',
    '## TL;DR（3句）',
    '- …',
    '- …',
    '- …',
    '',
    '## 关键信息（元数据）',
    `- 渠道：${channel}`,
    `- 发布时间：${published || ''}`,
    `- 原链接：${url}`,
    '- 字幕质量：good|noisy|incomplete（你判断）',
    '',
    '## 核心结论（最多5条）',
    '- （每条一句话，尽量带时间点 mm:ss）',
    '',
    '## 过程/方法（如果有）',
    '- 输入/前提：',
    '- 步骤：',
    '- 输出/结果：',
    '',
    '## 关键术语速记（最多8条）',
    '- 术语：一句话解释（必须能从字幕推断/或字幕原话）',
    '',
    '## 常见坑/边界条件（最多5条）',
    '- …',
    '',
    '## 可复用模板/清单（如果有）',
    '- （命令/检查清单/决策要点，能直接抄走用）',
    '',
    '## 行动项（3条）',
    '- [ ] …',
    '',
    '## 引用片段（最多5条）',
    '- “原话…”（mm:ss）',
    '',
    '约束：',
    '- 代码/命令必须用 ``` 包起来',
    '- 没出现就写“无/未提及”，不要硬补'
  ].join('\n');

  return { system, user };
}

function writeDailyMd({ studyDir, outRel, date, grouped }) {
  const outDir = path.join(studyDir, outRel);
  ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.md`);

  const lines = [];
  lines.push(`# ${date} YouTube 更新`);
  lines.push('');

  const channels = Object.keys(grouped);
  if (channels.length === 0) {
    lines.push('今日无更新。');
  } else {
    for (const ch of channels) {
      lines.push(`## ${ch}`);
      for (const it of grouped[ch]) {
        const t = it.published ? `（${it.published.replace('T', ' ').replace('Z', '')}）` : '';
        lines.push(`- [${it.title}](${it.link}) ${t}`.trim());
        if (it.analysisMd) {
          lines.push('');
          lines.push('  <details>');
          lines.push('  <summary>字幕分析（DeepSeek）</summary>');
          lines.push('');
          for (const l of String(it.analysisMd).split('\n')) lines.push('  ' + l);
          lines.push('');
          lines.push('  </details>');
          lines.push('');
        }
      }
      lines.push('');
    }
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

async function main() {
  const pushToken = process.env.STUDY_PUSH_TOKEN;
  if (!pushToken) throw new Error('Missing env STUDY_PUSH_TOKEN');
  const deepseekKey = process.env.DEEPSEEK_API_KEY || null;
  const maxAnalyze = Number(process.env.MAX_ANALYZE || 5);

  const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';
  const studyDir = process.env.STUDY_DIR || path.join(process.cwd(), '_out', 'jiangshu-study');
  const outRel = process.env.OUT_DIR_REL || 'youtube-daily';

  const channelsFile = path.join(process.cwd(), 'youtube', 'channels.txt');
  const channelUrls = readLines(channelsFile);
  if (channelUrls.length === 0) throw new Error('No channels in youtube/channels.txt');

  // clone study
  ensureDir(path.dirname(studyDir));
  if (fs.existsSync(studyDir)) safeExec(`rm -rf ${JSON.stringify(studyDir)}`);
  const authed = repo.replace('https://', `https://x-access-token:${pushToken}@`);
  safeExec(`git clone --depth 1 ${JSON.stringify(authed)} ${JSON.stringify(studyDir)}`);

  const allItems = [];
  for (const url of channelUrls) {
    let channelId;
    try {
      channelId = await resolveChannelId(url);
    } catch (e) {
      console.log(`[channel] skip resolve failed url=${url} reason=${e.message}`);
      continue;
    }
    const feedUrl = feedUrlForChannelId(channelId);
    console.log(`[feed] fetching channelId=${channelId} url=${url}`);
    const feed = await httpGet(feedUrl);
    if (feed.status >= 400) {
      console.log(`[feed] skip status=${feed.status} url=${url} channelId=${channelId}`);
      continue;
    }
    const entries = parseAtomEntries(feed.body);
    if (entries.length === 0) {
      console.log(`[feed] empty url=${url} channelId=${channelId} (maybe blocked/404 HTML despite 200)`);
    }
    for (const e of entries) allItems.push(e);
  }

  const date = todayShanghai();
  const testLatest = String(process.env.TEST_LATEST || '').toLowerCase() === 'true' || String(process.env.TEST_LATEST || '') === '1';

  let todayItems;
  if (testLatest) {
    // Manual test mode: pick the latest item per channel, regardless of publish date.
    const latestByChannel = new Map();
    for (const it of allItems) {
      const key = it.channelTitle || 'Unknown Channel';
      const prev = latestByChannel.get(key);
      if (!prev) {
        latestByChannel.set(key, it);
        continue;
      }
      if (String(it.published || '').localeCompare(String(prev.published || '')) > 0) {
        latestByChannel.set(key, it);
      }
    }
    todayItems = Array.from(latestByChannel.values());
    console.log(`[mode] TEST_LATEST enabled: channels_with_items=${todayItems.length}`);
    if (todayItems.length === 0) throw new Error('TEST_LATEST produced 0 items (all feeds empty/blocked)');
  } else {
    // Scheduled mode: filter to today's date in Asia/Shanghai by comparing YYYY-MM-DD of published.
    todayItems = allItems.filter((it) => {
      if (!it.published) return false;
      const d = new Date(it.published);
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
      return fmt.format(d) === date;
    });
  }

  // Optional: caption analysis (only if DEEPSEEK_API_KEY is provided).
  if (deepseekKey) {
    let count = 0;
    for (const it of todayItems) {
      if (count >= maxAnalyze) break;
      const cap = tryFetchCaptions({ videoUrl: it.link });
      if (!cap.ok) continue;
      const { system, user } = buildTechNotesPrompt({
        title: it.title,
        channel: it.channelTitle || 'Unknown Channel',
        url: it.link,
        published: it.published,
        transcript: cap.text
      });
      try {
        const md = await deepseekChat({ apiKey: deepseekKey, system, user });
        if (md) {
          it.analysisMd = md;
          count++;
        }
      } catch {
        // Non-fatal: keep list output even if analysis fails.
      }
    }
  }

  const grouped = {};
  for (const it of todayItems) {
    const k = it.channelTitle || 'Unknown Channel';
    grouped[k] = grouped[k] || [];
    grouped[k].push(it);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => String(a.published).localeCompare(String(b.published)));
  }

  const outPath = writeDailyMd({ studyDir, outRel, date, grouped });
  console.log('Wrote:', outPath);

  safeExec(`git add "${outRel}/"`, { cwd: studyDir });
  safeExec(`git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" commit -m "youtube-daily: ${date}" || true`, { cwd: studyDir });
  safeExec('git push origin HEAD', { cwd: studyDir });
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
