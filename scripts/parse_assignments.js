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

function parseFrontmatter(content) {
  // 找最后一个 frontmatter 块（填写区域）
  const matches = [...content.matchAll(/^---\r?\n([\s\S]*?)\r?\n---/gm)];
  if (matches.length === 0) return null;
  const match = matches[matches.length - 1];
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\S+?):\s*(.*)$/);
    if (m) fields[m[1].trim()] = m[2].trim();
  }
  return { fields, fullMatch: match[0], index: match.index };
}

function resetFrontmatter(content, index, fullMatch) {
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
    const diffMs = deadline - now;
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
  const fm = parseFrontmatter(content);
  const assignments = loadAssignments(data);

  // 解析新作业
  if (fm) {
    const f = fm.fields;
    if (f['状态'] === '待处理' && f['课程'] && f['标题'] && f['截止日期']) {
      const newAssignment = {
        id: `a-${Date.now()}`,
        course: f['课程'],
        title: f['标题'],
        deadline: new Date(f['截止日期'].replace(' ', 'T') + ':00+08:00').toISOString(),
        needsPhoto: f['需要图片'] === 'true',
        note: f['备注'] || undefined,
        done: false,
        createdAt: new Date().toISOString(),
      };
      assignments.push(newAssignment);
      saveAssignments(data, assignments);
      console.log(`[saved] 新作业已保存：${newAssignment.course} · ${newAssignment.title}`);

      // 重置 frontmatter
      content = resetFrontmatter(content, fm.index, fm.fullMatch);
    } else if (f['状态'] === '待处理' && (f['课程'] || f['标题'])) {
      console.log('[skip] frontmatter 填写不完整，跳过');
    } else {
      console.log('[info] 无新作业需要处理');
    }
  }

  // 重新渲染提醒列表
  const rendered = renderAssignmentsList(assignments);
  content = updateAssignmentsSection(content, rendered);
  fs.writeFileSync(note, content, 'utf8');
  console.log('[done] 作业.md 已更新');
}

main();
