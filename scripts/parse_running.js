#!/usr/bin/env node

/**
 * 读取 jiangshu-study/09-日常处理/阳光长跑.md，解析跑步记录，
 * 更新 timetable/data/running.json，并重新生成热力图。
 *
 * 规则：
 * - 北京时间 8:00 前推送 → 晨跑
 * - 其他时间 → 自由跑
 * - 学期：2026-03-23 开始，共 7 周 70 天
 * - 目标：50 次（其中晨跑 10 次）
 */

const fs = require('fs');
const path = require('path');

// 学期配置（用 UTC ms 避免时区歧义）
// 2026-03-23 00:00:00 北京时间 = 2026-03-22T16:00:00Z
const SEMESTER_START_MS = Date.UTC(2026, 2, 22, 16, 0, 0); // month 从 0 开始
const TOTAL_WEEKS = 7;
const TARGET_MORNING = 10;
const TARGET_TOTAL = 50;

// UTC+8 偏移量（毫秒）
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function parseArgs(argv) {
  const out = { note: null, data: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--note' && argv[i + 1]) out.note = argv[++i];
    if (argv[i] === '--data' && argv[i + 1]) out.data = argv[++i];
  }
  return out;
}

/**
 * 返回当前北京时间对应的 { dateStr, hour }
 * 全程用 UTC 方法，不依赖运行环境时区。
 */
function getBeijingNow() {
  const nowMs = Date.now();
  const bjMs = nowMs + CST_OFFSET_MS;
  const bjDate = new Date(bjMs);
  const y = bjDate.getUTCFullYear();
  const mo = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bjDate.getUTCDate()).padStart(2, '0');
  return {
    dateStr: `${y}-${mo}-${d}`,
    hour: bjDate.getUTCHours(),
    isoStr: new Date(nowMs).toISOString(), // 存储用真实 UTC ISO
  };
}

/**
 * 将学期第 dayOffset 天（0-based）转换为 YYYY-MM-DD 字符串。
 * 全程用 UTC 方法，不依赖运行环境时区。
 */
function semesterDayToDateStr(dayOffset) {
  const ms = SEMESTER_START_MS + dayOffset * 86400000;
  const d = new Date(ms + CST_OFFSET_MS); // 拨到北京时间后取 UTC 字段
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function parseRunningTrigger(content) {
  const match = content.match(/- \[x\]\s*🏃\s*今天跑步/);
  if (!match) return { triggered: false };
  return { triggered: true, matchText: match[0], matchIndex: match.index };
}

function resetRunningTrigger(content, matchIndex, matchText) {
  return (
    content.slice(0, matchIndex) +
    '- [ ] 🏃 今天跑步' +
    content.slice(matchIndex + matchText.length)
  );
}

function loadRunningData(dataPath) {
  if (!fs.existsSync(dataPath)) return { records: [] };
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch {
    return { records: [] };
  }
}

function saveRunningData(dataPath, data) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function generateHeatmap(records) {
  const recordMap = new Map(records.map(r => [r.date, r.type]));

  const lines = [];
  for (let week = 0; week < TOTAL_WEEKS; week++) {
    const cells = [];
    for (let day = 0; day < 7; day++) {
      const dateStr = semesterDayToDateStr(week * 7 + day);
      const type = recordMap.get(dateStr);
      if (type === 'morning') cells.push('🟩');
      else if (type === 'free') cells.push('🟨');
      else cells.push('⬜');
    }
    lines.push(`W${week + 1} ${cells.join('')}`);
  }
  return lines.join('\n');
}

function generateHistoryList(records) {
  if (records.length === 0) return '_暂无记录_';
  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
  return sorted
    .map(r => {
      const icon = r.type === 'morning' ? '🌅' : '🏃';
      const label = r.type === 'morning' ? '晨跑' : '自由跑';
      return `${icon} ${r.date.slice(5)} ${label}`;
    })
    .join('\n');
}

function renderRunningSection(records) {
  const morningCount = records.filter(r => r.type === 'morning').length;
  const total = records.length;
  const morningPct = Math.min(100, Math.round((morningCount / TARGET_MORNING) * 100));
  const totalPct = Math.min(100, Math.round((total / TARGET_TOTAL) * 100));

  const bar = pct => {
    if (pct === 0) return '░'.repeat(10);
    const filled = Math.max(1, Math.round(pct / 10));
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };

  return `> [!tip] 📊 进度
>
> **晨跑** ${morningCount}/${TARGET_MORNING} \`${bar(morningPct)}\` ${morningPct}%
> **总计** ${total}/${TARGET_TOTAL} \`${bar(totalPct)}\` ${totalPct}%

## 🔥 热力图

\`\`\`
${generateHeatmap(records)}
\`\`\`
🟩晨跑 🟨自由 ⬜未跑

## 📝 记录

${generateHistoryList(records)}`;
}

function updateRunningSection(content, rendered) {
  return content.replace(
    /<!-- RUNNING_START -->[\s\S]*?<!-- RUNNING_END -->/,
    `<!-- RUNNING_START -->\n\n${rendered}\n\n<!-- RUNNING_END -->`
  );
}

function main() {
  const { note, data } = parseArgs(process.argv);

  if (!note || !data) {
    console.error('Usage: node parse_running.js --note <阳光长跑.md> --data <running.json>');
    process.exit(2);
  }

  if (!fs.existsSync(note)) {
    console.error(`文件不存在: ${note}`);
    process.exit(2);
  }

  let content = fs.readFileSync(note, 'utf8');
  const runningData = loadRunningData(data);

  // 确保 records 字段存在
  if (!Array.isArray(runningData.records)) {
    runningData.records = [];
  }

  const trigger = parseRunningTrigger(content);

  if (trigger.triggered) {
    const { dateStr, hour, isoStr } = getBeijingNow();
    const alreadyRecorded = runningData.records.some(r => r.date === dateStr);

    if (!alreadyRecorded) {
      const type = hour < 8 ? 'morning' : 'free';
      runningData.records.push({ date: dateStr, type, createdAt: isoStr });
      saveRunningData(data, runningData);
      console.log(`[saved] ${dateStr} - ${type === 'morning' ? '晨跑' : '自由跑'}`);
    } else {
      console.log(`[skip] ${dateStr} 已记录过`);
    }

    // 无论是否重复，都重置开关
    content = resetRunningTrigger(content, trigger.matchIndex, trigger.matchText);
  } else {
    console.log('[info] 无新记录需要处理');
  }

  // 确保 running.json 始终存在（即使没有新记录也写入）
  saveRunningData(data, runningData);

  // 重新渲染统计区域并写回
  content = updateRunningSection(content, renderRunningSection(runningData.records));
  fs.writeFileSync(note, content, 'utf8');
  console.log('[done] 阳光长跑.md 已更新');
}

main();
