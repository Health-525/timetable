#!/usr/bin/env node
/**
 * analyze_knowledge.js 最小逻辑测试
 * 运行：node scripts/analyze_knowledge.test.js
 */

const {
  parseProfile,
  extractJSON,
  generateDryRunOutput,
} = require('./analyze_knowledge');

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

group('parseProfile - 标准分段提取', () => {
  const md = [
    '## 知识水平诊断',
    '',
    '### 优势区',
    '- ✅ 数学基础扎实',
    '- ✅ Python 熟练',
    '',
    '### 薄弱区',
    '- ❌ 深度学习框架经验不足',
    '- ❌ AI 理论体系零散',
    '',
    '### 关键知识空白',
    '- PCA 推导链路未串联',
    '---',
  ].join('\n');
  const parsed = parseProfile(md);
  assert('优势区提取正确', parsed.strengths, ['数学基础扎实', 'Python 熟练']);
  assert('薄弱区提取正确', parsed.weaknesses, ['深度学习框架经验不足', 'AI 理论体系零散']);
  assertTruthy('关键知识空白被提取', parsed.knownGaps.includes('PCA 推导链路未串联'));
});

group('extractJSON - 支持 code fence 与修复尾逗号', () => {
  const fenced = '```json\n{"gaps":[{"id":"gap-001","title":"A"}]}\n```';
  const repaired = 'LLM 输出如下：{"gaps":[{"id":"gap-002","title":"B",}],}';
  assert('code fence JSON 可解析', extractJSON(fenced), { gaps: [{ id: 'gap-001', title: 'A' }] });
  assert('尾逗号 JSON 可修复', extractJSON(repaired), { gaps: [{ id: 'gap-002', title: 'B' }] });
});

group('generateDryRunOutput - 兜底结构稳定', () => {
  const output = generateDryRunOutput(
    { strengths: [], weaknesses: [], knownGaps: '' },
    [
      { courseNum: '02', label: 'Python数据处理与分析', mdCount: 12, totalFiles: 14 },
      { courseNum: '08', label: 'AI学习', mdCount: 2, totalFiles: 3 },
    ],
    'no_llm'
  );
  assertTruthy('带有提示说明', output._note.includes('dry-run'));
  assertTruthy('默认优势已回填', output.profile.strengths.length > 0);
  assertTruthy('默认薄弱项已回填', output.profile.weaknesses.length > 0);
  assertTruthy('至少生成 3 个 gaps', output.gaps.length >= 3);
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
