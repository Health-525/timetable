#!/usr/bin/env node
/**
 * parse_adjustments.js 最小回归测试
 * 运行：node scripts/parse_adjustments.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  parseFrontmatter,
  resetFrontmatter,
  appendArchive,
  WEEKDAY_MAP,
  PERIOD_MAP,
} = require('./parse_adjustments');

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

group('字段映射 - 星期与节次', () => {
  assert('周一 -> 1', WEEKDAY_MAP['周一'], 1);
  assert('周日 -> 7', WEEKDAY_MAP['周日'], 7);
  assert('5-6 -> [5,6]', PERIOD_MAP['5-6'], [5, 6]);
});

group('parseFrontmatter - 读取 YAML frontmatter', () => {
  const content = [
    '---',
    '课程: 数据结构',
    '原星期: 周三',
    '原节次: 5-6',
    '目标星期: 周四',
    '目标节次: 7-8',
    '类型: 长期',
    '周次: 5',
    '状态: 待处理',
    '---',
    '',
    '## 已处理记录',
    '',
  ].join('\n');
  const parsed = parseFrontmatter(content);
  assert('课程字段正确', parsed.fields['课程'], '数据结构');
  assert('原星期字段正确', parsed.fields['原星期'], '周三');
  assert('类型字段正确', parsed.fields['类型'], '长期');
});

group('resetFrontmatter / appendArchive - 模板重置与归档', () => {
  const content = [
    '---',
    '课程: 数据结构',
    '原星期: 周三',
    '原节次: 5-6',
    '目标星期: 周四',
    '目标节次: 7-8',
    '类型: 长期',
    '周次: 5',
    '状态: 待处理',
    '---',
    '',
    '## 已处理记录',
    '',
  ].join('\n');
  const archived = appendArchive(content, {
    id: 'adj-test',
    courseTitle: '数据结构',
    sourceWeekday: 3,
    sourcePeriods: [5, 6],
    targetWeekday: 4,
    targetPeriods: [7, 8],
    mode: 'longterm',
    startWeek: 5,
  });
  assertTruthy('归档中包含 id', archived.includes('adj-test'));
  assertTruthy('归档中包含课程名', archived.includes('数据结构'));

  const reset = resetFrontmatter(archived);
  assertTruthy('重置后包含空模板', reset.includes('状态: 待处理'));
});

group('集成 - frontmatter 入库并归档', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-adjustments-'));
  const notePath = path.join(tmpDir, '调课.md');
  const dataPath = path.join(tmpDir, 'adjustments.json');

  const noteContent = [
    '---',
    '课程: 数据结构',
    '原星期: 周三',
    '原节次: 5-6',
    '目标星期: 周四',
    '目标节次: 7-8',
    '类型: 单次',
    '周次: 6',
    '状态: 待处理',
    '---',
    '',
    '## 已处理记录',
    '',
  ].join('\n');

  fs.writeFileSync(notePath, noteContent, 'utf8');
  fs.writeFileSync(dataPath, '[]\n', 'utf8');

  const result = spawnSync(process.execPath, [path.join(__dirname, 'parse_adjustments.js'), '--note', notePath, '--adj', dataPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });

  assert('脚本退出码为 0', result.status, 0);

  const saved = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert('新增 1 条调课', saved.length, 1);
  assert('课程写入正确', saved[0].courseTitle, '数据结构');
  assert('单次调课 specificWeek 正确', saved[0].specificWeek, 6);

  const updatedNote = fs.readFileSync(notePath, 'utf8');
  assertTruthy('归档区包含课程名', updatedNote.includes('- 课程：数据结构'));
  assertTruthy('frontmatter 已重置', updatedNote.includes('状态: 待处理'));
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
