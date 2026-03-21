#!/usr/bin/env node

/**
 * 读取 jiangshu-study/09-日常处理/作业.md，解析新作业记录，
 * 更新 timetable/data/assignments.json，
 * 并重新生成 作业.md 上方的提醒列表。
 *
 * Usage:
 *   node scripts/parse_assignments.js --note <作业.md路径> --data <assignments.json路径>
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { note: null, data: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--note' && argv[i + 1]) out.note = argv[++i];
    if (argv[i] === '--data' && argv[i + 1]) out.data = argv[++i];
  }
  return out;
}

function parseDeadline(str) {
  if (!str) return null;
  // 标准格式：2026-03-21 13:48
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(str.trim())) {
    return new Date(str.trim().replace(' ', 'T') + ':00+08:00').toISOString();
  }
  // 中文格式：2026年3月21日 13:48 或 2026年3月21日13:48
  const m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    const iso = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h}:${mi}:00+08:00`;
    return new Date(iso).toISOString();
  }
  // 兜底：直接尝试解析
  const d = new Date(str);
  return isNaN(d) ? null : d.toISOString();
}

function parseNeedsPhoto(str) {
  if (!str || str.trim() === '' || str.trim() === 'false') return false;
  if (str.trim() === 'true') return true;
  // 有内容（如图片文件名 IMG_1018）视为 true
  return true;
}

function parseFrontmatter(content) {
  // 找最后一个 frontmatter 块（填写区域，支持有无 --- 包裹）
  const matches = [...content.matchAll(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/gm)];

  // 同时查找无 --- 包裹的追加块（手机快捷指令写入格式）
  // 格式：课程：xxx（有实际内容）\n标题：xxx\n...
  const appendMatch = content.match(/\n(课程[：:]\s*\S[^\n]*\n标题[：:][^\n]*\n[\s\S]*?)$/m);

  let match = null;
  let isAppend = false;

  if (appendMatch) {
    // 优先处理追加块
    match = { index: content.indexOf(appendMatch[0]) + 1, fullMatch: appendMatch[0].trimStart(), fields: {} };
    isAppend = true;
    for (const line of appendMatch[1].split(/\r?\n/)) {
      const m = line.match(/^([^：:]+)[：:]\s*(.*)$/);
      if (m) match.fields[m[1].trim()] = m[2].trim();
    }
  } else if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const fields = {};
    for (const line of last[1].split(/\r?\n/)) {
      const m = line.match(/^([^：:]+)[：:]\s*(.*)$/);
      if (m) fields[m[1].trim()] = m[2].trim();
    }
    match = { fields, fullMatch: last[0], index: last.index };
  }

  if (!match) return null;
  return { fields: match.fields, fullMatch: match.fullMatch, index: match.index, isAppend };
}

function resetFrontmatter(content, index, fullMatch, isAppend) {
  if (isAppend) {
    // 追加块直接删除
    return content.slice(0, index).trimEnd() + '\n';
  }
  const reset = `---\n课程:\n标题:\n截止日期:\n需要图片: false\n备注:\n状态: 待处理\n---`;
  return content.slice(0, index) + reset + content.slice(index + fullMatch.length);
}

function loadAssignments(dataPath) {
  if (!fs.existsSync(dataPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveAssignments(dataPath, assignments) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(assignments, null, 2) + '\n', 'utf8');
}

function renderAssignmentsList(assignments) {
  const now = new Date();
  // 只显示未完成的
  const pending = assignments
    .filter(a => !a.done)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  if (pending.length === 0) {
    return '> 🎉 暂无待完成作业';
  }

  const lines = [];
  for (const a of pending) {
    const deadline = new Date(a.deadline);
    // 用北京时间计算天数差，避免UTC时区偏差
    const nowBJ = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const diffMs = deadline - nowBJ;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const deadlineStr = deadline.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

    let urgency = '';
    if (diffDays < 0) {
      urgency = '⚠️ 已逾期';
    } else if (diffDays <= 2) {
      urgency = `🔴 还剩 ${diffDays} 天`;
    } else if (diffDays <= 5) {
      urgency = `🟡 还剩 ${diffDays} 天`;
    } else {
      urgency = `🟢 还剩 ${diffDays} 天`;
    }

    const photoTag = a.needsPhoto ? ' 📷需上传图片' : '';
    const noteStr = a.note ? `\n  > ${a.note}` : '';

    lines.push(`### ${a.course} · ${a.title}`);
    lines.push(`- 截止：${deadlineStr} ${urgency}${photoTag}`);
    if (a.note) lines.push(`- 备注：${a.note}`);
    lines.push('');
  }

  return lines.join('\n');
}

function updateAssignmentsSection(content, rendered) {
  return content.replace(
    /<!-- ASSIGNMENTS_START -->[\s\S]*?<!-- ASSIGNMENTS_END -->/,
    `<!-- ASSIGNMENTS_START -->\n\n${rendered}\n\n<!-- ASSIGNMENTS_END -->`
  );
}

function main() {
  const { note, data } = parseArgs(process.argv);

  if (!note || !data) {
    console.error('Usage: node parse_assignments.js --note <作业.md> --data <assignments.json>');
    process.exit(2);
  }

  if (!fs.existsSync(note)) {
    console.error(`作业文件不存在: ${note}`);
    process.exit(2);
  }

  let content = fs.readFileSync(note, 'utf8');
  const assignments = loadAssignments(data);
  let savedCount = 0;

  // 循环处理所有追加块，直到没有可处理的为止
  while (true) {
    const fm = parseFrontmatter(content);
    if (!fm) break;
    const f = fm.fields;
    if (f['课程'] && f['标题'] && f['截止日期']) {
      const newAssignment = {
        id: `a-${Date.now()}-${savedCount}`,
        course: f['课程'],
        title: f['标题'],
        deadline: parseDeadline(f['截止日期']),
        needsPhoto: parseNeedsPhoto(f['需要图片']),
        note: f['备注'] || undefined,
        done: false,
        createdAt: new Date().toISOString(),
      };
      assignments.push(newAssignment);
      savedCount++;
      console.log(`[saved] 新作业已保存：${newAssignment.course} · ${newAssignment.title}`);
      content = resetFrontmatter(content, fm.index, fm.fullMatch, fm.isAppend);
    } else if (f['课程'] || f['标题']) {
      console.log('[skip] frontmatter 填写不完整，跳过');
      break;
    } else {
      console.log('[info] 无新作业需要处理');
      break;
    }
  }

  if (savedCount > 0) {
    saveAssignments(data, assignments);
    console.log(`[total] 共保存 ${savedCount} 条新作业`);
  }

  // 重新渲染提醒列表
  const rendered = renderAssignmentsList(assignments);
  content = updateAssignmentsSection(content, rendered);
  fs.writeFileSync(note, content, 'utf8');
  console.log('[done] 作业.md 已更新');
}

main();
