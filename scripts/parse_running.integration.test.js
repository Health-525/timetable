#!/usr/bin/env node
/**
 * parse_running.js 集成测试
 * 使用临时目录，不影响任何真实文件
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'running-test-'));
const notePath = path.join(tmpDir, '阳光长跑.md');
const dataPath = path.join(tmpDir, 'running.json');
const script = path.resolve(__dirname, 'parse_running.js');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ' → ' + detail : ''}`);
    failed++;
  }
}

function runScript() {
  return execSync(`node "${script}" --note "${notePath}" --data "${dataPath}"`, {
    encoding: 'utf8',
  }).trim();
}

const mdUnchecked = `# 阳光长跑
<!-- RUNNING_START -->
旧内容
<!-- RUNNING_END -->
---
## 记录跑步
- [ ] 🏃 今天跑步
`;

const mdChecked = mdUnchecked.replace('- [ ] 🏃 今天跑步', '- [x] 🏃 今天跑步');

// ── 场景1：无触发，仅渲染 ────────────────────────────────────────────────
console.log('\n[场景1] 无触发，仅重新渲染');
fs.writeFileSync(notePath, mdUnchecked, 'utf8');
fs.writeFileSync(dataPath, JSON.stringify({ records: [] }, null, 2), 'utf8');

const out1 = runScript();
const md1 = fs.readFileSync(notePath, 'utf8');
const data1 = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('  stdout:', out1);
assert('records 仍为空', data1.records.length === 0);
assert('包含 RUNNING_START 标记', md1.includes('RUNNING_START'));
assert('显示"暂无记录"', md1.includes('暂无记录'));
assert('开关未被修改（仍未勾选）', md1.includes('- [ ] 🏃 今天跑步'));
assert('stdout 含 [info]', out1.includes('[info]'));

// ── 场景2：勾选触发，写入记录 ────────────────────────────────────────────
console.log('\n[场景2] 勾选触发，写入新记录');
fs.writeFileSync(notePath, mdChecked, 'utf8');
fs.writeFileSync(dataPath, JSON.stringify({ records: [] }, null, 2), 'utf8');

const out2 = runScript();
const md2 = fs.readFileSync(notePath, 'utf8');
const data2 = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('  stdout:', out2);
console.log('  写入记录:', JSON.stringify(data2.records[0]));
assert('records 有1条', data2.records.length === 1);
assert('开关已重置为未勾选', !md2.includes('- [x]'));
assert('stdout 含 [saved]', out2.includes('[saved]'));
assert('date 格式正确 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(data2.records[0].date));
assert('type 为 morning 或 free', ['morning', 'free'].includes(data2.records[0].type));
assert('createdAt 是真实 UTC ISO', data2.records[0].createdAt.endsWith('Z'));
assert('热力图已更新（不含"旧内容"）', !md2.includes('旧内容'));

// ── 场景3：重复触发同一天，应跳过不重复写入 ──────────────────────────────
console.log('\n[场景3] 重复触发同一天，应跳过');
fs.writeFileSync(notePath, mdChecked, 'utf8');
// data2 已有今天的记录，不重置

const out3 = runScript();
const md3 = fs.readFileSync(notePath, 'utf8');
const data3 = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('  stdout:', out3);
assert('records 仍为1条（未重复写入）', data3.records.length === 1);
assert('开关已重置', !md3.includes('- [x]'));
assert('stdout 含 [skip]', out3.includes('[skip]'));

// ── 场景4：热力图日期正确性（固定记录） ──────────────────────────────────
console.log('\n[场景4] 热力图日期正确性');
const fixedRecords = [
  { date: '2026-03-23', type: 'free',    createdAt: '2026-03-23T04:00:00.000Z' },
  { date: '2026-03-24', type: 'morning', createdAt: '2026-03-23T23:00:00.000Z' },
  { date: '2026-03-30', type: 'free',    createdAt: '2026-03-30T10:00:00.000Z' }, // W2 第1天
];
fs.writeFileSync(notePath, mdUnchecked, 'utf8');
fs.writeFileSync(dataPath, JSON.stringify({ records: fixedRecords }, null, 2), 'utf8');

runScript();
const md4 = fs.readFileSync(notePath, 'utf8');
const heatmapMatch = md4.match(/```\n([\s\S]*?)\n```/);
const heatLines = heatmapMatch ? heatmapMatch[1].split('\n') : [];

console.log('  热力图:');
heatLines.forEach(l => console.log('   ', l));

assert('共7行', heatLines.length === 7);
assert('W1 第1格=🟨(自由)', heatLines[0].includes('🟨'), heatLines[0]);
assert('W1 第2格=🟩(晨跑)', heatLines[0], heatLines[0]); // 先检查存在
// 更精确：W1 = 🟨🟩⬜⬜⬜⬜⬜
assert('W1 正确: 🟨🟩⬜⬜⬜⬜⬜', heatLines[0] === 'W1 🟨🟩⬜⬜⬜⬜⬜', heatLines[0]);
assert('W2 第1格=🟨(2026-03-30)', heatLines[1].startsWith('W2 🟨'), heatLines[1]);
assert('W3-W7 全未跑', heatLines.slice(2).every(l => l.match(/W\d ⬜{7}/)), heatLines.slice(2).join('|'));

// ── 场景5：running.json 不存在时自动创建 ────────────────────────────────
console.log('\n[场景5] running.json 不存在，自动创建');
fs.writeFileSync(notePath, mdUnchecked, 'utf8');
if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);

runScript();
assert('running.json 已自动创建', fs.existsSync(dataPath));
const data5 = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
assert('records 字段存在', Array.isArray(data5.records));

// ── 清理 ──────────────────────────────────────────────────────────────────
fs.rmSync(tmpDir, { recursive: true });

// ── 汇总 ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
