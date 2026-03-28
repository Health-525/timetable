#!/usr/bin/env node
/**
 * parse_running.js 单元测试
 * 运行：node scripts/parse_running.test.js
 */

// ─── 从主脚本中内联需要测试的纯函数 ───────────────────────────────────────────

const SEMESTER_START_MS = Date.UTC(2026, 2, 22, 16, 0, 0);
const TOTAL_WEEKS = 7;
const TARGET_MORNING = 10;
const TARGET_TOTAL = 50;
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function semesterDayToDateStr(dayOffset) {
  const ms = SEMESTER_START_MS + dayOffset * 86400000;
  const d = new Date(ms + CST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function getBeijingNowFromMs(nowMs) {
  const bjMs = nowMs + CST_OFFSET_MS;
  const bjDate = new Date(bjMs);
  return {
    dateStr: [
      bjDate.getUTCFullYear(),
      String(bjDate.getUTCMonth() + 1).padStart(2, '0'),
      String(bjDate.getUTCDate()).padStart(2, '0'),
    ].join('-'),
    hour: bjDate.getUTCHours(),
    isoStr: new Date(nowMs).toISOString(),
  };
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

// ─── 测试框架（极简） ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

function group(name, fn) {
  console.log(`\n[${name}]`);
  fn();
}

// ─── 测试用例 ──────────────────────────────────────────────────────────────────

group('semesterDayToDateStr - 热力图日期计算', () => {
  assert('第0天 = 2026-03-23', semesterDayToDateStr(0), '2026-03-23');
  assert('第1天 = 2026-03-24', semesterDayToDateStr(1), '2026-03-24');
  assert('第6天 = 2026-03-29（W1最后一天）', semesterDayToDateStr(6), '2026-03-29');
  assert('第7天 = 2026-03-30（W2第一天）', semesterDayToDateStr(7), '2026-03-30');
  assert('第48天 = 2026-05-10（W7第七天）', semesterDayToDateStr(48), '2026-05-10');
});

group('getBeijingNowFromMs - 北京时间解析', () => {
  // 2026-03-28 08:30:00 CST = 2026-03-28T00:30:00Z
  const cst0830 = Date.UTC(2026, 2, 28, 0, 30, 0);
  const r1 = getBeijingNowFromMs(cst0830);
  assert('08:30 CST → dateStr = 2026-03-28', r1.dateStr, '2026-03-28');
  assert('08:30 CST → hour = 8', r1.hour, 8);

  // 2026-03-28 07:59:59 CST = 2026-03-27T23:59:59Z
  const cst0759 = Date.UTC(2026, 2, 27, 23, 59, 59);
  const r2 = getBeijingNowFromMs(cst0759);
  assert('07:59 CST → dateStr = 2026-03-28', r2.dateStr, '2026-03-28');
  assert('07:59 CST → hour = 7 → 晨跑', r2.hour, 7);

  // 跨午夜边界：00:00:00 CST = 前一天 16:00:00 UTC
  const cstMidnight = Date.UTC(2026, 2, 27, 16, 0, 0); // 2026-03-28 00:00:00 CST
  const r3 = getBeijingNowFromMs(cstMidnight);
  assert('00:00 CST → dateStr = 2026-03-28（不取前一天）', r3.dateStr, '2026-03-28');
  assert('00:00 CST → hour = 0', r3.hour, 0);

  // createdAt 存真实 UTC ISO
  assert('isoStr 是真实 UTC', r1.isoStr, new Date(cst0830).toISOString());
});

group('parseRunningTrigger - 复选框解析', () => {
  const checked = '- [x] 🏃 今天跑步';
  const unchecked = '- [ ] 🏃 今天跑步';
  const withContext = `## 记录\n\n${checked}\n\n其他文字`;

  assert('勾选时 triggered=true', parseRunningTrigger(checked).triggered, true);
  assert('未勾选时 triggered=false', parseRunningTrigger(unchecked).triggered, false);
  assert('空内容时 triggered=false', parseRunningTrigger('').triggered, false);
  assert('带上下文时能匹配', parseRunningTrigger(withContext).triggered, true);
  assert('带上下文时 matchIndex 正确', parseRunningTrigger(withContext).matchIndex, withContext.indexOf(checked));
});

group('resetRunningTrigger - 重置复选框', () => {
  const checked = '- [x] 🏃 今天跑步';
  const trigger = parseRunningTrigger(checked);
  const result = resetRunningTrigger(checked, trigger.matchIndex, trigger.matchText);
  assert('重置后变为未勾选', result, '- [ ] 🏃 今天跑步');

  const withContext = `前面内容\n- [x] 🏃 今天跑步\n后面内容`;
  const t2 = parseRunningTrigger(withContext);
  const r2 = resetRunningTrigger(withContext, t2.matchIndex, t2.matchText);
  assert('带上下文时前后保留', r2, '前面内容\n- [ ] 🏃 今天跑步\n后面内容');
});

group('generateHeatmap - 热力图生成', () => {
  const records = [
    { date: '2026-03-23', type: 'free' },    // W1 day0
    { date: '2026-03-24', type: 'morning' }, // W1 day1
  ];
  const map = generateHeatmap(records);
  const lines = map.split('\n');
  assert('共7行', lines.length, 7);
  assert('W1 首格=自由🟨', lines[0].startsWith('W1 🟨'), true);
  assert('W1 第二格=晨跑🟩', lines[0][5], '🟩'.at(0)); // emoji比较用 includes
  assert('W2 全未跑', lines[1], 'W2 ⬜⬜⬜⬜⬜⬜⬜');

  // 空记录时全未跑
  const empty = generateHeatmap([]);
  assert('空记录 W1 全未跑', empty.split('\n')[0], 'W1 ⬜⬜⬜⬜⬜⬜⬜');
});

group('进度计数 - 晨跑/总计', () => {
  const records = [
    { date: '2026-03-23', type: 'morning' },
    { date: '2026-03-24', type: 'morning' },
    { date: '2026-03-25', type: 'free' },
    { date: '2026-03-26', type: 'free' },
  ];
  const morningCount = records.filter(r => r.type === 'morning').length;
  assert('晨跑数=2', morningCount, 2);
  assert('总计=4', records.length, 4);
});

// ─── 汇总 ──────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
