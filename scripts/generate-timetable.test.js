#!/usr/bin/env node
/**
 * generate-timetable.js 最小回归测试
 * 运行：node scripts/generate-timetable.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseWeekSpec,
  applyAdjustments,
  weekIndex,
  main,
} = require('./generate-timetable');

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

function assertTruthy(label, value) {
  if (value) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    actual  : ${JSON.stringify(value)}`);
    failed++;
  }
}

function group(name, fn) {
  console.log(`\n[${name}]`);
  fn();
}

group('parseWeekSpec - 支持区间与混合写法', () => {
  assert('逆序区间自动纠正', Array.from(parseWeekSpec('5-3')), [3, 4, 5]);
  assert('混合区间解析正确', Array.from(parseWeekSpec('1,3,5-6')), [1, 3, 5, 6]);
});

group('weekIndex - 按周一计算周次', () => {
  const week1Monday = new Date('2026-03-02T00:00:00Z');
  assert('第一周周一为第1周', weekIndex(new Date('2026-03-02T00:00:00Z'), week1Monday), 1);
  assert('下一周周一为第2周', weekIndex(new Date('2026-03-09T00:00:00Z'), week1Monday), 2);
});

group('applyAdjustments - once 与 longterm 命中逻辑', () => {
  const courses = [
    { title: '数据结构与算法', weekday: 2, periods: [7, 8], weeks: '1-16', location: '原教室' },
    { title: 'Python数据处理与分析', weekday: 1, periods: [5, 6], weeks: '1-16', location: '旧地点' },
  ];
  const adjustments = [
    {
      courseTitle: '数据结构与算法',
      sourceWeekday: 2,
      sourcePeriods: [7, 8],
      targetWeekday: 4,
      targetPeriods: [3, 4],
      targetLocation: '新教室',
      mode: 'once',
      specificWeek: 5,
    },
    {
      courseTitle: 'Python数据处理与分析',
      sourceWeekday: 1,
      sourcePeriods: [5, 6],
      targetWeekday: 3,
      targetPeriods: [1, 2],
      targetLocation: '机房',
      mode: 'longterm',
      startWeek: 4,
    },
  ];

  const week5 = applyAdjustments(courses, adjustments, 5);
  assert('once 调课改到目标 weekday', week5[0].weekday, 4);
  assert('once 调课改到目标 periods', week5[0].periods, [3, 4]);
  assert('longterm 调课命中后改地点', week5[1].location, '机房');

  const week3 = applyAdjustments(courses, adjustments, 3);
  assert('longterm 未到起始周时保持原 weekday', week3[1].weekday, 1);
});

group('main - 生成最小课表 smoke', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timetable-test-'));
  const schedulePath = path.join(tmpDir, 'schedule.json');
  const adjustmentsPath = path.join(tmpDir, 'adjustments.json');
  const outputPath = path.join(tmpDir, '课表.md');

  fs.writeFileSync(schedulePath, JSON.stringify({
    meta: { week1_monday: '2026-03-02' },
    periodTimes: { '1': '08:10-08:55', '3': '10:20-11:05' },
    courses: [
      { title: '数据结构与算法', weekday: 2, periods: [1], weeks: '1-16', location: '仁智楼 312(多)' },
      { title: 'Python数据处理与分析', weekday: 4, periods: [3], weeks: '1-16', location: '笃学B楼 201(多)' },
    ],
  }, null, 2), 'utf8');
  fs.writeFileSync(adjustmentsPath, JSON.stringify([], null, 2), 'utf8');

  const prevArgv = process.argv.slice();
  process.argv = ['node', 'generate-timetable.js', schedulePath, adjustmentsPath, outputPath];
  try {
    const result = main();
    const content = fs.readFileSync(outputPath, 'utf8');
    assertTruthy('返回输出路径', result.outputPath === outputPath);
    assertTruthy('包含课程表标题', content.includes('# 课程表'));
    assertTruthy('包含今日或本周区块', content.includes('## 今日') && content.includes('## 本周'));
    assertTruthy('包含至少一个课程名缩写', content.includes('数据结构') || content.includes('Python数据'));
  } finally {
    process.argv = prevArgv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
