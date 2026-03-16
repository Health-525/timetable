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
const { execSync } = require('child_process');

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
  // Use a lightweight probe: fetch the channel page and extract externalId if present.
  const r = await httpGet(handleUrl);
  if (r.status >= 400) throw new Error(`channel_page_http_${r.status}`);
  const m = r.body.match(/"externalId"\s*:\s*"(UC[^"]+)"/);
  if (m && m[1]) return m[1];
  const m2 = r.body.match(/"channelId"\s*:\s*"(UC[^"]+)"/);
  if (m2 && m2[1]) return m2[1];
  throw new Error('channel_id_not_found');
}

function feedUrlForChannelId(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeExec(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
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
    const channelId = await resolveChannelId(url);
    const feedUrl = feedUrlForChannelId(channelId);
    const feed = await httpGet(feedUrl);
    if (feed.status >= 400) continue;
    const entries = parseAtomEntries(feed.body);
    for (const e of entries) allItems.push(e);
  }

  const date = todayShanghai();

  // Filter to today's date in Asia/Shanghai by comparing YYYY-MM-DD of published.
  const todayItems = allItems.filter((it) => {
    if (!it.published) return false;
    const d = new Date(it.published);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d) === date;
  });

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

  safeExec('git add youtube-daily/*.md', { cwd: studyDir });
  safeExec(`git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" commit -m "youtube-daily: ${date}" || true`, { cwd: studyDir });
  safeExec('git push', { cwd: studyDir });
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
