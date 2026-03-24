#!/usr/bin/env node

/**
 * 读取 jiangshu-study/09-日常处理/阳光长跑.md，解析跑步记录，
 * 更新 timetable/data/running.json，并重新生成热力图。
 *
 * 规则：
 * - 北京时间 8:00 前推送 → 晨跑
 * - 其他时间 → 自由跑
 * - 学期：2026-03-23 开始，共 7 周 70 天
 */

const fs = require('fs');
const path = require('path');

// 学期配置
const SEMESTER_START = new Date('2026-03-23T00:00:00+08:00');
const TOTAL_DAYS = 70;
const TOTAL_WEEKS = 7;

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
  // 格式：2026-03-24 或 2026年3月24日
  const m = str.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
  if (m) {
    return new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+08:00`);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function parseFrontmatter(content) {
  // 查找最后一个 frontmatter 块
  const matches = [...content.matchAll(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/gm)];

  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const fields = {};
  for (const line of last[1].split(/\r?\n/)) {
    const m = line.match(/^([^：:]+)[：:]\s*(.*)$/);
    if (m) fields[m[1].trim()] = m[2].trim();
  }

  return { fields, fullMatch: last[0], index: last.index };
}

function resetFrontmatter(content, index, fullMatch) {
  const reset = `---\n日期:\n---`;
  return content.slice(0, index) + reset + content.slice(index + fullMatch.length);
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
    const dates = [];

    for (let day = 0; day < 7; day++) {
      const dayOffset = week * 7 + day;
      const date = new Date(SEMESTER_START);
      date.setDate(date.getDate() + dayOffset);

      const dateStr = formatDate(date);
      const displayDate = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
      dates.push(displayDate);

      const type = recordMap.get(dateStr);
      if (type === 'morning') {
        weekDays.push('🟩');
      } else if (type === 'free') {
        weekDays.push('🟨');
      } else {
        weekDays.push('⬜');
      }
    }

    lines.push(`第${week + 1}周  ${dates.join(' ')}`);
    lines.push(`       ${weekDays.join('    ')}`);
    if (week < TOTAL_WEEKS - 1) lines.push('');
  }

  return lines.join('\n');
}

function generateHistoryTable(records) {
  if (records.length === 0) return '| - | - | - |';

  const lines = ['| 日期 | 类型 | 时间 |', '|:---|:---|:---|'];

  // 按日期倒序
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const r of sorted) {
    const type = r.type === 'morning' ? '晨跑' : '自由跑';
    const time = r.type === 'morning' ? '早上' : '下午';
    lines.push(`| ${r.date} | ${type} | ${time} |`);
  }

  return lines.join('\n');
}

function renderRunningSection(records) {
  const morningCount = records.filter(r => r.type === 'morning').length;
  const freeCount = records.filter(r => r.type === 'free').length;
  const total = records.length;
  const progress = ((total / TOTAL_DAYS) * 100).toFixed(1);

  const statsTable = [
    '| 指标 | 数值 |',
    '|:---|:---|',
    `| 晨跑 | ${morningCount} 次 |`,
    `| 自由跑 | ${freeCount} 次 |`,
    `| 总计 | ${total} / ${TOTAL_DAYS} 次 |`,
    `| 进度 | ${progress}% |`,
  ].join('\n');

  const heatmap = generateHeatmap(records);
  const historyTable = generateHistoryTable(records);

  return `## 📊 统计\n\n${statsTable}\n\n## 🔥 热力图\n\n\`\`\`\n${heatmap}\n\`\`\`\n\n图例：🟩 晨跑 | 🟨 自由跑 | ⬜ 未跑`;
}

function updateRunningSection(content, rendered) {
  return content.replace(
    /<!-- RUNNING_START -->[\s\S]*?<!-- RUNNING_END -->/,
    `<!-- RUNNING_START -->\n\n${rendered}\n\n<!-- RUNNING_END -->`
  );
}

function updateHistorySection(content, historyTable) {
  return content.replace(
    /## 📝 历史记录[\s\S]*?$/,
    `## 📝 历史记录\n\n${historyTable}`
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

  // 初始化已有记录（用户说已经跑了两次自由跑）
  if (runningData.records.length === 0) {
    runningData.records = [
      { date: '2026-03-23', type: 'free', createdAt: '2026-03-23T12:00:00+08:00' },
      { date: '2026-03-24', type: 'free', createdAt: '2026-03-24T12:00:00+08:00' },
    ];
  }

  // 解析 frontmatter
  const fm = parseFrontmatter(content);

  if (fm && fm.fields['日期']) {
    const inputDate = fm.fields['日期'].trim();
    const parsedDate = parseDate(inputDate);

    if (parsedDate) {
      const dateStr = formatDate(parsedDate);

      // 检查是否已记录
      if (!runningData.records.find(r => r.date === dateStr)) {
        // 判断晨跑/自由跑（根据推送时间，即当前北京时间）
        const now = getBeijingTime();
        const hour = now.getHours();
        const type = hour < 8 ? 'morning' : 'free';

        runningData.records.push({
          date: dateStr,
          type,
          createdAt: now.toISOString(),
        });

        const typeName = type === 'morning' ? '晨跑' : '自由跑';
        console.log(`[saved] ${dateStr} - ${typeName}`);

        // 重置 frontmatter
        content = resetFrontmatter(content, fm.index, fm.fullMatch);
        saveRunningData(data, runningData);
      } else {
        console.log(`[skip] ${dateStr} 已记录过`);
      }
    } else {
      console.log('[skip] 日期格式无效');
    }
  } else {
    console.log('[info] 无新记录需要处理');
  }

  // 重新渲染
  const rendered = renderRunningSection(runningData.records);
  content = updateRunningSection(content, rendered);

  const historyTable = generateHistoryTable(runningData.records);
  content = updateHistorySection(content, historyTable);

  fs.writeFileSync(note, content, 'utf8');
  console.log('[done] 阳光长跑.md 已更新');
}

main();
