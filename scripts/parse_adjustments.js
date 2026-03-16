#!/usr/bin/env node

/**
 * 读取 jiangshu-study/调课.md，解析调课记录，
 * 更新 timetable/data/adjustments.json，
 * 并将已处理的条目归档。
 *
 * Usage:
 *   node scripts/parse_adjustments.js --note <调课.md路径> --adj <adjustments.json路径>
 */

const fs = require('fs');
const path = require('path');

const WEEKDAY_MAP = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 7 };

const PERIOD_MAP = {
  '1-2': [1, 2],
  '3-4': [3, 4],
  '5-6': [5, 6],
  '7-8': [7, 8],
  '9-10': [9, 10],
};

function parseArgs(argv) {
  const out = { note: null, adj: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--note' && argv[i + 1]) out.note = argv[++i];
    if (argv[i] === '--adj' && argv[i + 1]) out.adj = argv[++i];
  }
  return out;
}

function parsePendingBlocks(content) {
  // 提取 ## 待处理 和 ## 已处理 之间的内容
  const pendingMatch = content.match(/##\s*待处理([\s\S]*?)(?=##\s*已处理|$)/);
  if (!pendingMatch) return [];

  const pendingSection = pendingMatch[1];

  // 找所有 ### 调课-xxx 块
  const blockRegex = /###\s*(调课-[^\n]+)\n([\s\S]*?)(?=###\s*调课-|$)/g;
  const blocks = [];
  let m;
  while ((m = blockRegex.exec(pendingSection)) !== null) {
    const id = m[1].trim();
    const body = m[2];

    // 跳过注释块
    if (body.trim().startsWith('<!--')) continue;

    const fields = {};
    const fieldRegex = /^-\s*(\S+?)：\s*(.+)$/gm;
    let fm;
    while ((fm = fieldRegex.exec(body)) !== null) {
      fields[fm[1].trim()] = fm[2].trim();
    }

    // 验证必填字段
    const required = ['课程', '原星期', '原节次', '目标星期', '目标节次', '类型', '周次'];
    const missing = required.filter((k) => !fields[k]);
    if (missing.length > 0) {
      console.log(`[skip] ${id} 缺少字段: ${missing.join(', ')}`);
      continue;
    }

    const srcWeekday = WEEKDAY_MAP[fields['原星期']];
    const dstWeekday = WEEKDAY_MAP[fields['目标星期']];
    const srcPeriods = PERIOD_MAP[fields['原节次']];
    const dstPeriods = PERIOD_MAP[fields['目标节次']];
    const mode = fields['类型'] === '长期' ? 'longterm' : 'once';
    const week = parseInt(fields['周次'], 10);

    if (!srcWeekday || !dstWeekday) {
      console.log(`[skip] ${id} 星期格式错误`);
      continue;
    }
    if (!srcPeriods || !dstPeriods) {
      console.log(`[skip] ${id} 节次格式错误（支持: 1-2 / 3-4 / 5-6 / 7-8 / 9-10）`);
      continue;
    }
    if (isNaN(week) || week < 1) {
      console.log(`[skip] ${id} 周次格式错误`);
      continue;
    }

    blocks.push({
      id,
      raw: m[0],
      adjustment: {
        id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        courseTitle: fields['课程'],
        sourceWeekday: srcWeekday,
        sourcePeriods: srcPeriods,
        targetWeekday: dstWeekday,
        targetPeriods: dstPeriods,
        mode,
        startWeek: week,
        specificWeek: mode === 'once' ? week : undefined,
        createdAt: new Date().toISOString(),
        note: `来自Obsidian调课记录 ${id}`,
      },
    });
  }
  return blocks;
}

function archiveBlocks(content, processedBlocks) {
  if (processedBlocks.length === 0) return content;

  let updated = content;

  // 把每个已处理的块从待处理区移除，加到已处理区
  for (const block of processedBlocks) {
    // 从待处理区移除原始块
    updated = updated.replace(block.raw, '');

    // 构建归档条目
    const adj = block.adjustment;
    const weekdayRevMap = Object.fromEntries(Object.entries(WEEKDAY_MAP).map(([k, v]) => [v, k]));
    const periodRevMap = Object.fromEntries(
      Object.entries(PERIOD_MAP).map(([k, v]) => [v.join(','), k])
    );
    const srcPeriodStr = periodRevMap[adj.sourcePeriods.join(',')] || adj.sourcePeriods.join('-');
    const dstPeriodStr = periodRevMap[adj.targetPeriods.join(',')] || adj.targetPeriods.join('-');

    const archiveEntry = [
      `### ${block.id}（已处理 ${new Date().toLocaleDateString('zh-CN')}）`,
      `- 课程：${adj.courseTitle}`,
      `- 原星期：${weekdayRevMap[adj.sourceWeekday]}`,
      `- 原节次：${srcPeriodStr}`,
      `- 目标星期：${weekdayRevMap[adj.targetWeekday]}`,
      `- 目标节次：${dstPeriodStr}`,
      `- 类型：${adj.mode === 'longterm' ? '长期' : '单次'}`,
      `- 周次：${adj.startWeek}`,
      '',
    ].join('\n');

    // 插入到已处理区域
    updated = updated.replace(
      /##\s*已处理\n(<!-- 自动归档.*?-->)?/,
      `## 已处理\n<!-- 自动归档，请勿手动修改此区域 -->\n\n${archiveEntry}`
    );
  }

  return updated;
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
  const pending = parsePendingBlocks(content);

  if (pending.length === 0) {
    console.log('[done] 没有待处理的调课记录');
    return;
  }

  console.log(`[found] 发现 ${pending.length} 条待处理记录`);

  // 更新 adjustments.json
  const existing = loadAdjustments(adj);
  const newAdjs = [...existing, ...pending.map((b) => b.adjustment)];
  saveAdjustments(adj, newAdjs);
  console.log(`[saved] adjustments.json 已更新，共 ${newAdjs.length} 条`);

  // 归档已处理条目，更新 调课.md
  const updatedContent = archiveBlocks(content, pending);
  fs.writeFileSync(note, updatedContent, 'utf8');
  console.log(`[archived] 调课.md 已归档 ${pending.length} 条`);

  // 输出处理结果供 Actions 日志查看
  for (const b of pending) {
    const a = b.adjustment;
    console.log(`  ✓ ${b.id}: ${a.courseTitle} ${a.mode === 'once' ? `第${a.startWeek}周` : `第${a.startWeek}周起`}`);
  }
}

main();
