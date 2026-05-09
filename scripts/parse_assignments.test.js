#!/usr/bin/env node
/**
 * parse_assignments.js 最小回归测试
 * 运行：node scripts/parse_assignments.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  parseDeadline,
  parseFrontmatter,
  resetFrontmatter,
  updateAssignmentsSection,
} = require('./parse_assignments');

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

group('parseDeadline - 标准与中文日期', () => {
  assert('标准格式转 ISO', parseDeadline('2026-03-21 13:48'), '2026-03-21T05:48:00.000Z');
  assert('中文格式转 ISO', parseDeadline('2026年3月21日 13:48'), '2026-03-21T05:48:00.000Z');
  assert('非法格式返回 null', parseDeadline('不是日期'), null);
});

group('parseFrontmatter - frontmatter 与追加块', () => {
  const withFm = [
    '---',
    '课程: 数值分析',
    '作业内容: 上机实验',
    '截止日期: 2026-03-21 13:48',
    '---',
  ].join('\n');
  const parsedFm = parseFrontmatter(withFm);
  assert('frontmatter 课程字段正确', parsedFm.fields['课程'], '数值分析');
  assert('frontmatter 作业字段正确', parsedFm.fields['作业内容'], '上机实验');
  assert('frontmatter 不是 append', parsedFm.isAppend, false);

  const appendBlock = [
    '## 作业记录',
    '',
    '课程：高等数学',
    '标题：作业2',
    '截止日期：2026-03-22 18:00',
  ].join('\n');
  const parsedAppend = parseFrontmatter(appendBlock);
  assert('追加块课程字段正确', parsedAppend.fields['课程'], '高等数学');
  assert('追加块标题字段正确', parsedAppend.fields['标题'], '作业2');
  assert('追加块标记为 append', parsedAppend.isAppend, true);
});

group('resetFrontmatter / updateAssignmentsSection - 回写模板', () => {
  const content = [
    '---',
    '课程: 数值分析',
    '作业内容: 上机实验',
    '截止日期: 2026-03-21 13:48',
    '---',
    '',
    '<!-- ASSIGNMENTS_START -->',
    '旧内容',
    '<!-- ASSIGNMENTS_END -->',
  ].join('\n');
  const parsed = parseFrontmatter(content);
  const reset = resetFrontmatter(content, parsed.index, parsed.fullMatch, parsed.isAppend);
  assertTruthy('重置后包含空模板', reset.includes('状态: 待处理'));

  const updated = updateAssignmentsSection(reset, '> [!tip] 🎉 暂无待完成作业');
  assertTruthy('提醒区被替换', updated.includes('暂无待完成作业'));
});

group('集成 - 追加块入库并重写提醒区', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-assignments-'));
  const notePath = path.join(tmpDir, '作业.md');
  const dataPath = path.join(tmpDir, 'assignments.json');

  const noteContent = [
    '<!-- ASSIGNMENTS_START -->',
    '',
    '旧提醒',
    '',
    '<!-- ASSIGNMENTS_END -->',
    '',
    '## 作业记录',
    '',
    '课程：线性代数',
    '标题：第一章习题',
    '截止日期：2026-03-22 18:00',
  ].join('\n');

  fs.writeFileSync(notePath, noteContent, 'utf8');
  fs.writeFileSync(dataPath, '[]\n', 'utf8');

  const result = spawnSync(process.execPath, [path.join(__dirname, 'parse_assignments.js'), '--note', notePath, '--data', dataPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });

  assert('脚本退出码为 0', result.status, 0);

  const saved = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert('新增 1 条作业', saved.length, 1);
  assert('课程写入正确', saved[0].course, '线性代数');
  assert('标题写入正确', saved[0].title, '第一章习题');

  const updatedNote = fs.readFileSync(notePath, 'utf8');
  assertTruthy('提醒区包含新作业', updatedNote.includes('线性代数 · 第一章习题'));
  assertTruthy('追加块已被移除', !updatedNote.includes('标题：第一章习题'));
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
