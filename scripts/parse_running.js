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

// 学期配置
const SEMESTER_START = new Date('2026-03-23T00:00:00+08:00');
const TOTAL_WEEKS = 7;
const TARGET_MORNING = 10;
const TARGET_TOTAL = 50;

function parseArgs(argv) {
  const out = { note: null, data: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--note' && argv[i + 1]) out.note = argv[++i];
    if (argv[i] === '--data' && argv[i + 1]) out.data = argv[++i];
  }
  return out;
}

function getBeijingTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
  if (m) {
    return new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+08:00`);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function parseRunningTrigger(content) {
  // 查找复选框：- [x] 🏃 今天跑步
  const match = content.match(/- \[x\]\s*🏃\s*今天跑步/);
  if (!match) return { triggered: false };

  return { triggered: true, matchText: match[0], matchIndex: match.index };
}

function resetRunningTrigger(content, matchIndex, matchText) {
  // 重置为未勾选状态
  return content.slice(0, matchIndex) + '- [ ] 🏃 今天跑步' + content.slice(matchIndex + matchText.length);
}

function loadRunningData(dataPath) {
  if (!fs.existsSync(dataPath)) return { records: [] };
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return data;
  } catch { return { records: [] }; }
}

function saveRunningData(dataPath, data) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function generateHeatmap(records) {
  const recordMap = new Map();
  for (const r of records) {
    recordMap.set(r.date, r.type);
  }

  const lines = [];
  for (let week = 0; week < TOTAL_WEEKS; week++) {
    const weekDays = [];
    for (let day = 0; day < 7; day++) {
      const dayOffset = week * 7 + day;
      const date = new Date(SEMESTER_START);
      date.setDate(date.getDate() + dayOffset);
      const dateStr = formatDate(date);
      const type = recordMap.get(dateStr);
      if (type === 'morning') {
        weekDays.push('🟩');
      } else if (type === 'free') {
        weekDays.push('🟨');
      } else {
        weekDays.push('⬜');
      }
    }
    lines.push(`W${week + 1} ${weekDays.join('')}`);
  }
  return lines.join('\n');
}

function generateHistoryList(records) {
  if (records.length === 0) return '_暂无记录_';
  const lines = [];
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const r of sorted) {
    const icon = r.type === 'morning' ? '🌅' : '🏃';
    const type = r.type === 'morning' ? '晨跑' : '自由跑';
    const dateDisplay = r.date.slice(5);
    lines.push(`${icon} ${dateDisplay} ${type}`);
  }
  return lines.join('\n');
}

function renderRunningSection(records) {
  const morningCount = records.filter(r => r.type === 'morning').length;
  const total = records.length;
  const morningProgress = Math.min(100, Math.round((morningCount / TARGET_MORNING) * 100));
  const totalProgress = Math.min(100, Math.round((total / TARGET_TOTAL) * 100));

  // 进度条
  const bar = (percent) => {
    const filled = Math.floor(percent / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };

  const heatmap = generateHeatmap(records);
  const historyList = generateHistoryList(records);

  return `> [!tip] 📊 进度
>
> **晨跑** ${morningCount}/${TARGET_MORNING} \`${bar(morningProgress)}\` ${morningProgress}%
> **总计** ${total}/${TARGET_TOTAL} \`${bar(totalProgress)}\` ${totalProgress}%

## 🔥 热力图

\`\`\`
${heatmap}
\`\`\`
🟩晨跑 🟨自由 ⬜未跑

## 📝 记录

${historyList}`;
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

  // 初始化已有记录
  if (runningData.records.length === 0) {
    runningData.records = [
      { date: '2026-03-23', type: 'free', createdAt: '2026-03-23T12:00:00+08:00' },
      { date: '2026-03-24', type: 'free', createdAt: '2026-03-24T12:00:00+08:00' },
    ];
  }

  // 解析 Emoji 开关
  const trigger = parseRunningTrigger(content);

  if (trigger.triggered) {
    const now = getBeijingTime();
    const dateStr = formatDate(now);

    // 检查是否已记录今天
    if (!runningData.records.find(r => r.date === dateStr)) {
      const hour = now.getHours();
      const type = hour < 8 ? 'morning' : 'free';

      runningData.records.push({
        date: dateStr,
        type,
        createdAt: now.toISOString(),
      });

      const typeName = type === 'morning' ? '晨跑' : '自由跑';
      console.log(`[saved] ${dateStr} - ${typeName}`);

      // 重置开关
      content = resetRunningTrigger(content, trigger.matchIndex, trigger.matchText);
      saveRunningData(data, runningData);
    } else {
      console.log(`[skip] ${dateStr} 已记录过`);
      // 仍然重置开关
      content = resetRunningTrigger(content, trigger.matchIndex, trigger.matchText);
    }
  } else {
    console.log('[info] 无新记录需要处理');
  }

  // 重新渲染
  const rendered = renderRunningSection(runningData.records);
  content = updateRunningSection(content, rendered);

  fs.writeFileSync(note, content, 'utf8');
  console.log('[done] 阳光长跑.md 已更新');
}

main();
