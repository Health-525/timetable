const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpGet(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

function parseAtomEntries(xml) {
  const entries = [];
  const beforeFirstEntry = xml.split('<entry>')[0] || xml;
  const channelTitle = (beforeFirstEntry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';

  const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
  for (const em of entryMatches) {
    const block = em[1];
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = ((block.match(/<link[^>]*href="([^"]+)"[^>]*>/) || [])[1] || '').trim();
    const published = ((block.match(/<published>([^<]+)<\/published>/) || [])[1] || '').trim();
    if (title && link) entries.push({ title, link, published, channelTitle });
  }
  return entries;
}

async function main() {
  const channels = [
    { url: 'https://www.youtube.com/@tech-shrimp', name: '技术虾' },
    { url: 'https://www.youtube.com/@qiuzhi2046', name: '秋芝2046' },
    { url: 'https://www.youtube.com/@3blue1brown', name: '3Blue1Brown' },
    { url: 'https://www.youtube.com/@Computerphile', name: 'Computerphile' },
    { url: 'https://www.youtube.com/@TwoMinutePapers', name: 'TwoMinutePapers' },
    { url: 'https://www.youtube.com/@AndrejKarpathy', name: 'Andrej Karpathy' },
    { url: 'https://www.youtube.com/@YannicKilcher', name: 'Yannic Kilcher' },
    { url: 'https://www.youtube.com/@statquest', name: 'StatQuest' },
    { url: 'https://www.youtube.com/@fireship', name: 'Fireship' },
    { url: 'https://www.youtube.com/@ThePrimeagen', name: 'ThePrimeagen' },
    { url: 'https://www.youtube.com/@LexClips', name: 'Lex Clips' },
  ];

  console.log('=== 检查各频道最新视频 ===\n');

  for (const ch of channels) {
    try {
      // 获取频道页面
      const page = await httpGet(ch.url);
      const channelIdMatch = page.body.match(/"externalId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/) ||
                             page.body.match(/"channelId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/) ||
                             page.body.match(/"browseId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/);

      if (!channelIdMatch) {
        console.log(`❌ ${ch.name}: 无法获取channelId`);
        continue;
      }

      const channelId = channelIdMatch[1];

      // 获取RSS feed
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      const feed = await httpGet(feedUrl);

      if (feed.status >= 400) {
        console.log(`❌ ${ch.name}: Feed HTTP ${feed.status}`);
        continue;
      }

      const entries = parseAtomEntries(feed.body);

      if (entries.length === 0) {
        console.log(`⚠️ ${ch.name}: Feed为空`);
        continue;
      }

      // 显示最新3个视频
      const latest = entries.slice(0, 3);
      console.log(`✅ ${ch.name} (${entries.length}个视频)`);
      for (const e of latest) {
        const pubDate = new Date(e.published);
        const now = new Date();
        const hoursAgo = Math.round((now - pubDate) / (1000 * 60 * 60));
        const daysAgo = Math.round(hoursAgo / 24);
        const timeAgo = daysAgo > 0 ? `${daysAgo}天前` : `${hoursAgo}小时前`;
        console.log(`   - ${e.title.substring(0, 50)}... (${timeAgo})`);
      }
      console.log('');

    } catch (e) {
      console.log(`❌ ${ch.name}: ${e.message}\n`);
    }
  }
}

main();
