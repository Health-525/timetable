#!/usr/bin/env node
/**
 * 爬取南京工业大学教务处通知公告
 * https://jwc.njtech.edu.cn
 *
 * 输出：JSON 文件，供 ScholarFlow 前端读取
 * 运行：node scripts/fetch_jwc_news.js _out/jwc_news.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE_URL = 'https://jwc.njtech.edu.cn';

// 目标页面列表（通知公告 + 教学动态）
const TARGETS = [
  { label: '通知公告', url: `${BASE_URL}/tzgg.htm` },
  { label: '教学动态', url: `${BASE_URL}/jxdt.htm` },
];

// ── HTTP 请求 ───────────────────────────────────────────────
function fetchHtml(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Charset': 'utf-8,gbk',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
      },
    }, (res) => {
      // 跟随重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return fetchHtml(redirectUrl, timeout).then(resolve).catch(reject);
      }

      if (res.statusCode < 200 || res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // 检测编码：校园网系统常用 GBK
        const raw = buf.toString('utf8');
        const charsetMatch = raw.match(/charset=['"]*([^'";\s>]+)/i);
        const charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';

        let html;
        if (charset === 'gbk' || charset === 'gb2312' || charset === 'gb18030') {
          // Node.js 不内置 GBK，用 TextDecoder（Node 18+）
          try {
            html = new TextDecoder('gbk').decode(buf);
          } catch {
            html = raw; // 降级
          }
        } else {
          html = raw;
        }
        resolve(html);
      });
      res.on('error', reject);
    });

    req.setTimeout(timeout, () => req.destroy(new Error(`Timeout ${url}`)));
    req.on('error', reject);
  });
}

// ── HTML 解析：提取通知列表 ────────────────────────────────
function parseNewsList(html, baseUrl) {
  const items = [];

  // 常见教务系统的列表结构：
  // <a href="/info/1234/5678.htm">通知标题</a>
  // <span class="news_date">2026-06-04</span>
  // 或 <li><a href="...">...</a><span>日期</span></li>

  // 策略1：找所有带日期的链接（最通用）
  // 匹配 href 指向 /info/ 或 .htm 的链接，附近有日期
  const linkPattern = /<a[^>]+href=['"]((?:https?:\/\/[^'"]+|\/[^'"]+\.htm[^'"]*))['"]\s*[^>]*>([\s\S]*?)<\/a>/gi;
  const datePattern = /20\d{2}[-./]\d{1,2}[-./]\d{1,2}/;

  // 找包含日期的段落
  const segments = html.split(/<\/li>|<\/p>|<\/div>/i);

  for (const seg of segments) {
    // 段落里要有链接和日期
    const linkMatch = linkPattern.exec(seg);
    if (!linkMatch) {
      linkPattern.lastIndex = 0;
      continue;
    }
    linkPattern.lastIndex = 0;

    const href = linkMatch[1];
    const rawTitle = linkMatch[2].replace(/<[^>]+>/g, '').trim();

    // 过滤：标题太短、是导航链接、是 JS
    if (rawTitle.length < 4) continue;
    if (/javascript:|#|mailto:/i.test(href)) continue;

    const dateMatch = seg.match(datePattern);
    if (!dateMatch) continue;

    // 构建完整 URL
    let fullUrl;
    try {
      fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
    } catch {
      fullUrl = baseUrl + href;
    }

    items.push({
      title: rawTitle.slice(0, 80),
      url: fullUrl,
      date: dateMatch[0].replace(/[./]/g, '-'),
    });
  }

  // 策略2：如果策略1没找到，用更宽泛的匹配
  if (items.length === 0) {
    const broadLink = /<a[^>]+href=['"]([^'"]+\.htm[^'"]*)['"]\s*[^>]*title=['"]([^'"]{4,80})['"]/gi;
    let m;
    while ((m = broadLink.exec(html)) !== null) {
      const href = m[1];
      const title = m[2].trim();
      if (/javascript:|#|首页|导航/i.test(href + title)) continue;
      let fullUrl;
      try {
        fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
      } catch {
        fullUrl = baseUrl + href;
      }
      items.push({ title, url: fullUrl, date: '' });
    }
  }

  // 去重（同 URL）并限制数量
  const seen = new Set();
  return items
    .filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 20);
}

// ── 主逻辑 ─────────────────────────────────────────────────
async function main(argv) {
  const [outputPath] = argv.slice(2);
  if (!outputPath) {
    console.error('Usage: node fetch_jwc_news.js <output.json>');
    process.exit(1);
  }

  const allItems = [];
  let fetchedAt = new Date().toISOString();

  for (const target of TARGETS) {
    console.log(`[jwc] 爬取 ${target.label}: ${target.url}`);
    try {
      const html = await fetchHtml(target.url);
      const items = parseNewsList(html, BASE_URL);
      console.log(`[jwc]   → 找到 ${items.length} 条通知`);
      for (const item of items) {
        allItems.push({ ...item, category: target.label });
      }
    } catch (err) {
      console.error(`[jwc]   → 失败: ${err.message}`);
    }
  }

  // 按日期降序排序
  allItems.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const result = {
    fetchedAt,
    source: BASE_URL,
    count: allItems.length,
    items: allItems,
  };

  // 如果抓取失败（网络不通），保留旧数据
  if (allItems.length === 0) {
    console.warn('[jwc] 未抓取到任何通知，检查网络或网站结构是否变化');
    // 如果已有旧数据文件，保留不覆盖
    if (fs.existsSync(outputPath)) {
      console.log('[jwc] 保留旧数据');
      process.exit(0);
    }
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[jwc] 写入 ${allItems.length} 条 → ${outputPath}`);
}

main(process.argv).catch(err => {
  console.error('[jwc] 致命错误:', err.message);
  process.exit(0); // 不阻断其他 workflow
});
