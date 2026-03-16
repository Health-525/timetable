#!/usr/bin/env node

/**
 * Fetch daily updates from YouTube channel RSS feeds and write a daily markdown file
 * into jiangshu-study/youtube-daily/YYYY-MM-DD.md, then commit & push.
 *
 * Required env:
 *   STUDY_PUSH_TOKEN  GitHub token with repo write access to Health-525/jiangshu-study
 *
 * Optional env:
 *   STUDY_REPO            default: https://github.com/Health-525/jiangshu-study.git
 *   STUDY_DIR             default: ./_out/jiangshu-study
 *   OUT_DIR_REL           default: youtube-daily
 *   DEEPSEEK_API_KEY      enables caption analysis via DeepSeek
 *   GLM_API_KEY           enables caption analysis via GLM (Zhipu AI)
 *   YOUTUBE_COOKIES_FILE  path to Netscape cookies.txt for yt-dlp
 *   MAX_ANALYZE           max videos to analyze (default 5)
 *   TEST_LATEST           set to 'true' to ignore today filter
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

function todayShanghai() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

// HTTP GET with redirect follow (YouTube channel pages 301/302)
function httpGet(url, _redirects) {
  const redirects = _redirects || 0;
  if (redirects > 5) return Promise.reject(new Error('too_many_redirects'));
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      },
      (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          resolve(httpGet(res.headers.location, redirects + 1));
          return;
        }
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
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
  // Extract feed-level channel title (first <title> before any <entry>)
  const beforeFirstEntry = xml.split('<entry>')[0] || xml;
  const channelTitle = escapeXml(
    (beforeFirstEntry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || ''
  ).trim();

  const entryMatches = pickAll(/<entry>([\s\S]*?)<\/entry>/g, xml);
  for (const em of entryMatches) {
    const block = em[1];
    const title = escapeXml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
    const link = ((block.match(/<link[^>]*href="([^"]+)"[^>]*>/) || [])[1] || '').trim();
    const published = ((block.match(/<published>([^<]+)<\/published>/) || [])[1] || '').trim();
    if (title && link) entries.push({ title, link, published, channelTitle });
  }
  return entries;
}

async function resolveChannelId(handleUrl) {
  // Direct /channel/UCxxxx URL
  const direct = handleUrl.match(/\/channel\/(UC[A-Za-z0-9_-]+)/);
  if (direct) return direct[1];

  // @handle or other URL: fetch page and extract channel ID
  const r = await httpGet(handleUrl);
  if (r.status >= 400) throw new Error(`channel_page_http_${r.status}`);

  for (const pat of [
    /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
    /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
    /"browseId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/,
    /\/channel\/(UC[A-Za-z0-9_-]+)/,
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

// Use shell:true so globs expand; pass paths as args to avoid injection
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
      // Timestamp lines: HH:MM:SS.mmm --> ...
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false;
      if (/^\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false;
      // Block headers
      if (/^(NOTE|STYLE|REGION)(\s|$)/.test(l)) return false;
      // Numeric cue IDs
      if (/^\d+$/.test(l.trim())) return false;
      return true;
    })
    .map((l) => l.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean);

  // YouTube auto-captions repeat lines as they scroll; deduplicate adjacent
  const deduped = [];
  for (const l of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== l) {
      deduped.push(l);
    }
  }
  return deduped.join('\n');
}

function tryFetchCaptions({ videoUrl }) {
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
    // Solve YouTube n-challenge / signature via EJS + Node.js runtime
    '--remote-components', 'ejs:github',
    '-o', outTpl,
  ];

  const cookiesFile = process.env.YOUTUBE_COOKIES_FILE;
  if (cookiesFile && fs.existsSync(cookiesFile)) {
    args.push('--cookies', cookiesFile);
    console.log(`[captions] using cookies: ${cookiesFile}`);
  } else {
    console.log('[captions] no cookies file, may hit bot detection');
  }

  args.push(videoUrl);

  console.log(`[captions] fetching: ${videoUrl}`);
  const r = spawnSync('yt-dlp', args, { encoding: 'utf8', timeout: 90000 });
  if (r.status !== 0) {
    const detail = (r.stderr || '').slice(0, 800);
    console.log(`[captions] yt_dlp_failed status=${r.status}\n${detail}`);
    return { ok: false, reason: 'yt_dlp_failed', detail };
  }

  const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.vtt'));
  if (files.length === 0) {
    console.log(`[captions] no_captions for ${videoUrl}`);
    return { ok: false, reason: 'no_captions' };
  }

  // Prefer zh; fall back to first available
  const pick = files.find((f) => /\.zh/i.test(f)) || files[0];
  console.log(`[captions] picked: ${pick}`);
  const vtt = fs.readFileSync(path.join(tmp, pick), 'utf8');
  const text = vttToText(vtt);
  if (!text.trim()) {
    console.log(`[captions] captions_empty for ${videoUrl}`);
    return { ok: false, reason: 'captions_empty' };
  }
  return { ok: true, langFile: pick, text };
}

// Generic OpenAI-compatible chat (used by both DeepSeek and Qwen)
function openaiCompatChat({ hostname, path: apiPath, apiKey, model, system, user, label }) {
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
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            return reject(new Error(`${label}_http_${res.statusCode}: ${txt.slice(0, 400)}`));
          }
          let obj;
          try {
            obj = JSON.parse(txt);
          } catch {
            return reject(new Error(`${label}_invalid_json`));
          }
          const content =
            obj && obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content;
          resolve(String(content || '').trim());
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error(`${label}_timeout`)));
    req.write(payload);
    req.end();
  });
}

function deepseekChat({ apiKey, system, user }) {
  return openaiCompatChat({
    hostname: 'api.deepseek.com',
    path: '/v1/chat/completions',
    apiKey,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    system,
    user,
    label: 'deepseek',
  });
}

function glmChat({ apiKey, system, user }) {
  return openaiCompatChat({
    hostname: 'open.bigmodel.cn',
    path: '/api/paas/v4/chat/completions',
    apiKey,
    model: process.env.GLM_MODEL || 'glm-4-flash',
    system,
    user,
    label: 'glm',
  });
}

// Race available LLMs; return first success
async function llmChat({ deepseekKey, glmKey, system, user }) {
  const tasks = [];
  if (deepseekKey) tasks.push(deepseekChat({ apiKey: deepseekKey, system, user }).then(r => ({ r, src: 'deepseek' })));
  if (glmKey)      tasks.push(glmChat({ apiKey: glmKey, system, user }).then(r => ({ r, src: 'glm' })));
  if (tasks.length === 0) throw new Error('no_llm_key');

  // Promise.any: resolves with first success, rejects only if all fail
  const { r, src } = await Promise.any(tasks);
  console.log(`[llm] success via ${src}`);
  return r;
}

function buildTechNotesPrompt({ title, channel, url, published, transcript }) {
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
        const t = it.published
          ? `（${it.published.replace('T', ' ').replace('Z', ' UTC')}）`
          : '';
        lines.push(`- [${it.title}](${it.link}) ${t}`.trim());
        if (it.analysisMd) {
          lines.push('');
          lines.push('  <details>');
          lines.push('  <summary>字幕分析（AI）</summary>');
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
  const glmKey = process.env.GLM_API_KEY || null;
  const maxAnalyze = Number(process.env.MAX_ANALYZE || 5);

  const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';
  const studyDir = process.env.STUDY_DIR || path.join(process.cwd(), '_out', 'jiangshu-study');
  const outRel = process.env.OUT_DIR_REL || 'youtube-daily';

  const channelsFile = path.join(process.cwd(), 'youtube', 'channels.txt');
  const channelUrls = readLines(channelsFile);
  if (channelUrls.length === 0) throw new Error('No channels in youtube/channels.txt');

  // Clone jiangshu-study with token
  ensureDir(path.dirname(studyDir));
  if (fs.existsSync(studyDir)) {
    // Use execSync directly to avoid shell quoting issues with the path
    execSync(`rm -rf "${studyDir}"`, { stdio: 'inherit', shell: true });
  }
  const authed = repo.replace('https://', `https://x-access-token:${pushToken}@`);
  execSync(`git clone --depth 1 "${authed}" "${studyDir}"`, { stdio: 'inherit', shell: true });

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
    let feed;
    try {
      feed = await httpGet(feedUrl);
    } catch (e) {
      console.log(`[feed] fetch error url=${url} reason=${e.message}`);
      continue;
    }
    if (feed.status >= 400) {
      console.log(`[feed] skip status=${feed.status} url=${url} channelId=${channelId}`);
      continue;
    }
    const entries = parseAtomEntries(feed.body);
    console.log(`[feed] got ${entries.length} entries for ${channelId}`);
    for (const e of entries) allItems.push(e);
  }

  const date = todayShanghai();
  const testLatest =
    String(process.env.TEST_LATEST || '').toLowerCase() === 'true' ||
    String(process.env.TEST_LATEST || '') === '1';

  let todayItems;
  if (testLatest) {
    // Pick the latest item per channel regardless of publish date
    const latestByChannel = new Map();
    for (const it of allItems) {
      const key = it.channelTitle || 'Unknown Channel';
      const prev = latestByChannel.get(key);
      if (!prev || String(it.published || '') > String(prev.published || '')) {
        latestByChannel.set(key, it);
      }
    }
    todayItems = Array.from(latestByChannel.values());
    console.log(`[mode] TEST_LATEST: channels_with_items=${todayItems.length}`);
    if (todayItems.length === 0) throw new Error('TEST_LATEST produced 0 items (all feeds empty/blocked)');
  } else {
    todayItems = allItems.filter((it) => {
      if (!it.published) return false;
      const d = new Date(it.published);
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return fmt.format(d) === date;
    });
    console.log(`[mode] scheduled: date=${date} matched=${todayItems.length}`);
  }

  // Caption analysis: fetch captions serially (avoid 429), then analyze in parallel
  if (deepseekKey || glmKey) {
    // Step 1: fetch captions serially, collect items that have transcripts
    const toAnalyze = [];
    for (const it of todayItems) {
      if (toAnalyze.length >= maxAnalyze) break;
      const cap = tryFetchCaptions({ videoUrl: it.link });
      if (!cap.ok) continue;
      toAnalyze.push({ it, cap });
    }
    console.log(`[analysis] ${toAnalyze.length} items with captions, analyzing in parallel...`);

    // Step 2: analyze all in parallel
    await Promise.all(
      toAnalyze.map(async ({ it, cap }, idx) => {
        const { system, user } = buildTechNotesPrompt({
          title: it.title,
          channel: it.channelTitle || 'Unknown Channel',
          url: it.link,
          published: it.published,
          transcript: cap.text,
        });
        try {
          const md = await llmChat({ deepseekKey, glmKey, system, user });
          if (md) {
            it.analysisMd = md;
            console.log(`[analysis] done (${idx + 1}/${toAnalyze.length}): ${it.title}`);
          }
        } catch (e) {
          console.log(`[analysis] failed for "${it.title}": ${e.errors ? e.errors.map(x => x.message).join(', ') : e.message}`);
        }
      })
    );
  } else {
    console.log('[analysis] skipped: no DEEPSEEK_API_KEY or GLM_API_KEY');
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

  // Commit & push
  safeExec(`git add "${outRel}"`, { cwd: studyDir });
  safeExec(
    `git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" commit -m "youtube-daily: ${date}" || true`,
    { cwd: studyDir }
  );
  safeExec('git push origin HEAD', { cwd: studyDir });
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
