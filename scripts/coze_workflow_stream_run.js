#!/usr/bin/env node

/**
 * Call Coze workflow stream_run API and extract the best aggregated text.
 *
 * Env:
 *   COZE_API_KEY (required)
 *
 * Usage:
 *   node scripts/coze_workflow_stream_run.js --workflow 7617... --url https://...
 */

const https = require('https');

function parseArgs(argv) {
  const out = { workflow: null, url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workflow' && argv[i + 1]) out.workflow = argv[++i];
    else if (a === '--url' && argv[i + 1]) out.url = argv[++i];
  }
  return out;
}

function request({ hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname,
        path,
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

async function main() {
  const { workflow, url } = parseArgs(process.argv);
  const apiKey = process.env.COZE_API_KEY;

  if (!apiKey) {
    console.error('Missing env COZE_API_KEY');
    process.exit(2);
  }
  if (!workflow || !url) {
    console.error('Usage: node scripts/coze_workflow_stream_run.js --workflow <id> --url <url>');
    process.exit(2);
  }

  const resp = await request({
    hostname: 'api.coze.cn',
    path: '/v1/workflow/stream_run',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { workflow_id: String(workflow), parameters: { url: String(url) } },
  });

  if (resp.status < 200 || resp.status >= 300) {
    console.error(`HTTP ${resp.status}`);
    console.error(resp.text.slice(0, 4000));
    process.exit(2);
  }

  const best = pickBestText(extractSSEPayloads(resp.text));
  if (!best) {
    console.error('No content extracted from stream response.');
    process.exit(1);
  }

  process.stdout.write(best + '\n');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(2);
});
