#!/usr/bin/env node
/**
 * 从 AIHOT 获取每日 AI 精选新闻
 */

const fs = require('fs');
const path = require('path');

const API = 'https://aihot.virxact.com/api/public/items?mode=selected&limit=6';

async function main(argv) {
  const [outputPath] = argv.slice(2);
  if (!outputPath) { console.error('Usage: fetch_ai_news.js <out.json>'); return 2; }

  try {
    const res = await fetch(API, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const items = (data.items || []).slice(0, 6).map(item => ({
      title: item.title || '',
      url: item.url || '',
      source: item.source || '',
      summary: (item.summary || '').replace(/\n+/g, ' ').slice(0, 60),
      category: item.category || '',
    }));

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(items, null, 2), 'utf8');
    console.log(`[ai_news] ${items.length} items → ${outputPath}`);
    return 0;
  } catch (e) {
    // 网络错误不中断整个 workflow，输出空数组
    console.error(`[ai_news] fetch failed: ${e.message}`);
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputPath, '[]', 'utf8');
    return 0;
  }
}

if (require.main === module) main(process.argv).then(code => process.exit(code));
