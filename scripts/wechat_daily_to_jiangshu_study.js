#!/usr/bin/env node

/**
 * timetable pipeline: summarize WeChat URLs via Coze, then write markdown into jiangshu-study.
 *
 * Required env:
 *   COZE_API_KEY      Coze bearer token
 *   STUDY_PUSH_TOKEN  GitHub token with repo write access to Health-525/jiangshu-study
 *
 * Optional env:
 *   WORKFLOW_ID       default: 7617432622935851034
 *   STUDY_REPO        default: https://github.com/Health-525/jiangshu-study.git
 *   STUDY_DIR         default: ./_out/jiangshu-study
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
    day: '2-digit',
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function readUrls(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  return txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function request({ hostname, path: reqPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname,
        path: reqPath,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
          ...headers,
        },
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (buf += d));
        res.on('end', () => resolve({ status: res.statusCode, text: buf }));
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('coze_timeout')));
    req.write(JSON.stringify(body));
    req.end();
  });
}

function extractSSEPayloads(text) {
  const lines = String(text || '').split(/\r?\n/);
  const payloads = [];
  for (const l of lines) if (l.startsWith('data:')) payloads.push(l.slice('data:'.length).trim());
  return payloads;
}

function pickBestText(payloads) {
  let best = '';
  for (const p of payloads) {
    if (!p || p === '[DONE]') continue;
    try {
      const obj = JSON.parse(p);
      const stack = [obj];
      while (stack.length) {
        const cur = stack.pop();
        if (cur === null || cur === undefined) continue;
        if (typeof cur === 'string') {
          const s = cur.trim();
          if (s.length > best.length) best = s;
        } else if (Array.isArray(cur)) stack.push(...cur);
        else if (typeof cur === 'object') stack.push(...Object.values(cur));
      }
    } catch {
      if (p.length > best.length) best = p;
    }
  }
  return best.trim();
}

async function runCoze({ workflowId, url, apiKey }) {
  const resp = await request({
    hostname: 'api.coze.cn',
    path: '/v1/workflow/stream_run',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { workflow_id: String(workflowId), parameters: { url: String(url) } },
  });
  if (resp.status < 200 || resp.status >= 300) {
    const err = new Error(`Coze HTTP ${resp.status}`);
    err.details = resp.text.slice(0, 2000);
    throw err;
  }
  const best = pickBestText(extractSSEPayloads(resp.text));
  if (!best) throw new Error('No content extracted from Coze stream response');
  return best;
}

function safeExec(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeDailyMd({ studyDir, date, items }) {
  const outDir = path.join(studyDir, '公众号推送');
  ensureDir(outDir);
  const outPath = path.join(outDir, `${date}.md`);

  const lines = [];
  lines.push(`# ${date} 公众号摘要`);
  lines.push('');

  for (const it of items) {
    lines.push('---');
    lines.push('');
    lines.push('## 原文链接');
    lines.push(it.url);
    lines.push('');
    lines.push('## 摘要');
    lines.push(String(it.summary || '').trim());
    lines.push('');
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

async function main() {
  const apiKey = process.env.COZE_API_KEY;
  const pushToken = process.env.STUDY_PUSH_TOKEN;
  const workflowId = process.env.WORKFLOW_ID || '7617432622935851034';
  const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';
  const studyDir = process.env.STUDY_DIR || path.join(process.cwd(), '_out', 'jiangshu-study');

  if (!apiKey) throw new Error('Missing env COZE_API_KEY');
  if (!pushToken) throw new Error('Missing env STUDY_PUSH_TOKEN');

  const urlsFile = path.join(process.cwd(), 'wechat', 'urls.txt');
  if (!fs.existsSync(urlsFile)) throw new Error('Missing urls file: ' + urlsFile);

  const urls = readUrls(urlsFile);
  if (!urls.length) throw new Error('No URLs found in ' + urlsFile);

  // Clone jiangshu-study with token (do not print token)
  ensureDir(path.dirname(studyDir));
  if (fs.existsSync(studyDir)) safeExec(`rm -rf ${JSON.stringify(studyDir)}`);

  const authed = repo.replace('https://', `https://x-access-token:${pushToken}@`);
  safeExec(`git clone --depth 1 ${JSON.stringify(authed)} ${JSON.stringify(studyDir)}`);

  const items = [];
  for (const url of urls) {
    const summary = await runCoze({ workflowId, url, apiKey });
    items.push({ url, summary });
  }

  const date = todayShanghai();
  const outPath = writeDailyMd({ studyDir, date, items });
  console.log('Wrote:', outPath);

  // Commit & push
  safeExec('git status -sb', { cwd: studyDir });
  safeExec('git add "公众号推送/"', { cwd: studyDir });
  safeExec(`git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" commit -m "wechat-daily: ${date}" || true`, { cwd: studyDir });
  safeExec('git push origin HEAD', { cwd: studyDir });
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  if (e && e.details) console.error(String(e.details));
  process.exit(1);
});
