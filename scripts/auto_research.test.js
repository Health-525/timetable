#!/usr/bin/env node
/**
 * auto_research.js 最小逻辑测试
 * 运行：node scripts/auto_research.test.js
 */

const { selectOpenGaps, parseGoogleResults, buildSearchQueries } = require('./auto_research');

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

group('selectOpenGaps - 只跳过已 resolved 项', () => {
  const gaps = [
    { id: 'g3', title: 'C', priority: 3 },
    { id: 'g1', title: 'A', priority: 1 },
    { id: 'g2', title: 'B', priority: 2 },
  ];
  const progress = {
    gaps: {
      g2: { status: 'resolved' },
      g3: { status: 'failed' },
    },
  };
  const selected = selectOpenGaps(gaps, progress).map((item) => item.id);
  assert('保留 failed，跳过 resolved，并按 priority 排序', selected, ['g1', 'g3']);
});

group('buildSearchQueries - 生成可轮换查询', () => {
  const gap = {
    title: 'Transformer 注意力机制',
    suggestedTopic: 'self-attention',
    prerequisites_met: ['矩阵乘法', '向量'],
  };
  assert('variant=0 返回教程查询', buildSearchQueries(gap, 0), ['self-attention 教程 数学推导']);
  assert('variant=1 返回详解查询', buildSearchQueries(gap, 1), ['self-attention 详解 矩阵乘法 向量']);
  assert('variant=2 返回代码实现查询', buildSearchQueries(gap, 2), ['self-attention 代码实现 入门']);
});

group('parseGoogleResults - 解析标题和链接', () => {
  const html = [
    '<html><body>',
    '<a href="/url?q=https://example.com/doc1&sa=U"><h3>注意力机制详解</h3></a>',
    '<div class="BNeawe">这是第一条摘要，长度足够被提取出来，并且会被当前解析器识别。</div>',
    '<a href="/url?q=https://example.com/doc2&sa=U"><h3>Transformer 教程</h3></a>',
    '<div class="BNeawe">这是第二条摘要，也会进入结果，而且长度同样足够。</div>',
    '</body></html>',
  ].join('');
  const results = parseGoogleResults(html);
  assert('结果数=2', results.length, 2);
  assert('第一条标题正确', results[0].title, '注意力机制详解');
  assert('第一条链接正确', results[0].link, 'https://example.com/doc1');
  assertTruthy('摘要被提取', results[0].snippet.includes('第一条摘要'));
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
