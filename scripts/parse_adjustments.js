#!/usr/bin/env node

/**
 * 读取 jiangshu-study/调课.md（YAML frontmatter 格式），解析调课记录，
 * 更新 timetable/data/adjustments.json，
 * 并将已处理的条目归档到 ## 已处理记录 区域。
 *
 * Usage:
 *   node scripts/parse_adjustments.js --note <调课.md路径> --adj <adjustments.json路径>
 */

const fs = require('fs');
const path = require('path');

const WEEKDAY_MAP = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 7 };
const WEEKDAY_REV = Object.fromEntries(Object.entries(WEEKDAY_MAP).map(([k, v]) => [v, k]));

const PERIOD_MAP = {
  '1-2': [1, 2],
  '3-4': [3, 4],
  '5-6': [5, 6],
  '7-8': [7, 8],
  '9-10': [9, 10],
};
const PERIOD_REV = Object.fromEntries(
  Object.entries(PERIOD_MAP).map(([k, v]) => [v.join(','), k])
);

function parseArgs(argv) {
  const out = { note: null, adj: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--note' && argv[i + 1]) out.note = argv[++i];
    if (argv[i] === '--adj' && argv[i + 1]) out.adj = argv[++i];
  }
  return out;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const raw = match[1];
  const fields = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^(\S+?):\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    // Normalize simple quoted scalars like "5" or '周一' -> 5 / 周一
    const q = v.match(/^["']([\s\S]*)["']$/);
    if (q) v = String(q[1]).trim();
    fields[k] = v;
  }
  return { fields, raw: match[0] };
}

function resetFrontmatter(content) {
  return content.replace(
    /^---\r?\n[\s\S]*?\r?\n---/,
    `---\n课程:\n原星期:\n原节次:\n目标星期:\n目标节次:\n类型:\n周次:\n状态: 待处理\n---`
  );
}

function appendArchive(content, adj) {
  const date = new Date().toLocaleDateString('zh-CN');
  const srcPeriodStr = PERIOD_REV[adj.sourcePeriods.join(',')] || adj.sourcePeriods.join('-');
  const dstPeriodStr = PERIOD_REV[adj.targetPeriods.join(',')] || adj.targetPeriods.join('-');

  const entry = [
    `### ${adj.id}（${date}）`,
    `- 课程：${adj.courseTitle}`,
    `- 原星期：${WEEKDAY_REV[adj.sourceWeekday]}`,
    `- 原节次：${srcPeriodStr}`,
    `- 目标星期：${WEEKDAY_REV[adj.targetWeekday]}`,
    `- 目标节次：${dstPeriodStr}`,
    adj.targetLocation ? `- 目标教室：${adj.targetLocation}` : null,
    `- 类型：${adj.mode === 'longterm' ? '长期' : '单次'}`,
    `- 周次：${adj.startWeek}`,
    '',
  ].filter(Boolean).join('\n');

  return content.replace(
    /(##\s*已处理记录\s*\n)(<!-- 自动归档[^>]*-->\s*\n?)?/,
    `$1<!-- 自动归档，请勿手动修改此区域 -->\n\n${entry}`
  );
}

function loadAdjustments(adjPath) {
  if (!fs.existsSync(adjPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(adjPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveAdjustments(adjPath, adjs) {
  fs.mkdirSync(path.dirname(adjPath), { recursive: true });
  fs.writeFileSync(adjPath, JSON.stringify(adjs, null, 2) + '\n', 'utf8');
}

function main() {
  const { note, adj } = parseArgs(process.argv);

  if (!note || !adj) {
    console.error('Usage: node parse_adjustments.js --note <调课.md> --adj <adjustments.json>');
    process.exit(2);
  }

  if (!fs.existsSync(note)) {
    console.error(`调课文件不存在: ${note}`);
    process.exit(2);
  }

  const content = fs.readFileSync(note, 'utf8');
  const fm = parseFrontmatter(content);

  if (!fm) {
    console.log('[done] 没有找到 frontmatter，跳过');
    return;
  }

  const f = fm.fields;

  if (f['状态'] !== '待处理') {
    console.log(`[done] 状态为「${f['状态']}」，无需处理`);
    return;
  }

  const required = ['课程', '原星期', '原节次', '目标星期', '目标节次', '类型', '周次'];
  const missing = required.filter((k) => !f[k]);
  if (missing.length > 0) {
    console.log(`[skip] 缺少字段: ${missing.join(', ')}`);
    return;
  }

  const srcWeekday = WEEKDAY_MAP[f['原星期']];
  const dstWeekday = WEEKDAY_MAP[f['目标星期']];
  const srcPeriods = PERIOD_MAP[f['原节次']];
  const dstPeriods = PERIOD_MAP[f['目标节次']];
  const mode = f['类型'] === '长期' ? 'longterm' : 'once';
  const week = parseInt(f['周次'], 10);

  if (!srcWeekday || !dstWeekday) {
    console.log(`[skip] 星期格式错误`);
    return;
  }
  if (!srcPeriods || !dstPeriods) {
    console.log(`[skip] 节次格式错误（支持: 1-2 / 3-4 / 5-6 / 7-8 / 9-10）`);
    return;
  }
  if (isNaN(week) || week < 1) {
    console.log(`[skip] 周次格式错误`);
    return;
  }

  const adjustment = {
    id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    courseTitle: f['课程'],
    sourceWeekday: srcWeekday,
    sourcePeriods: srcPeriods,
    targetWeekday: dstWeekday,
    targetPeriods: dstPeriods,
    targetLocation: f['目标教室'] || undefined,
    mode,
    startWeek: week,
    specificWeek: mode === 'once' ? week : undefined,
    createdAt: new Date().toISOString(),
    note: `来自Obsidian调课记录`,
  };

  const existing = loadAdjustments(adj);
  saveAdjustments(adj, [...existing, adjustment]);
  console.log(`[saved] adjustments.json 已更新，共 ${existing.length + 1} 条`);

  let updated = appendArchive(content, adjustment);
  updated = resetFrontmatter(updated);
  fs.writeFileSync(note, updated, 'utf8');
  console.log(`[archived] 调课.md 已归档并重置`);

  console.log(
    `  ✓ ${adjustment.courseTitle}：${WEEKDAY_REV[srcWeekday]} ${f['原节次']} → ${WEEKDAY_REV[dstWeekday]} ${f['目标节次']}，${mode === 'once' ? `第${week}周` : `第${week}周起`}`
  );
}

main();
