#!/usr/bin/env node
/**
 * 生成 Obsidian 仪表板 Markdown — 移动端优先排版
 *
 * Usage:
 *   node generate-dashboard.js <schedule.json> <assignments.json> <running.json>
 *       <learning_gaps.json> <日报dir> <youtube-dir> <output.md>
 */

const fs = require('fs');
const path = require('path');

const CST_MS = 8 * 60 * 60 * 1000;

function bjNow() {
  return new Date(Date.now() + CST_MS);
}

function bjToday() {
  const d = bjNow();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function diffDays(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDeadlineBJ(isoStr) {
  const d = new Date(isoStr);
  const bj = new Date(d.getTime() + CST_MS);
  return `${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日 ${pad2(bj.getUTCHours())}:${pad2(bj.getUTCMinutes())}`;
}

function deadlineBJDateOnly(isoStr) {
  const d = new Date(isoStr);
  const bj = new Date(d.getTime() + CST_MS);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()));
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ── 课表 ──

const WEEKDAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function parseWeekSpec(spec) {
  const weeks = [];
  for (const part of String(spec || '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [a, b] = trimmed.split('-').map(Number);
      for (let w = a; w <= b; w++) weeks.push(w);
    } else weeks.push(Number(trimmed));
  }
  return weeks;
}

function getCurrentWeek(schedule) {
  const week1Monday = new Date(schedule.meta?.week1_monday || '2026-03-02');
  const today = bjToday();
  const diff = Math.floor((today.getTime() - week1Monday.getTime()) / (7 * 86400000));
  return { week: Math.max(1, diff + 1), weekday: bjNow().getUTCDay() || 7 };
}

function getTodayCourses(schedule) {
  const { week, weekday } = getCurrentWeek(schedule);
  const periodTimes = schedule.periodTimes || {};
  const courses = [];

  for (const course of schedule.courses || []) {
    if (Number(course.weekday) !== weekday) continue;
    const weeks = parseWeekSpec(course.weeks);
    if (!weeks.includes(week)) continue;

    const periods = Array.isArray(course.periods) ? course.periods : [];
    const timeWindow = periodTimes[String(periods[0])] || '';
    const [start, end] = timeWindow ? timeWindow.split('-').map(s => s.trim()) : ['?', '?'];

    courses.push({
      title: course.title.replace(/\s+/g, ' ').trim(),
      location: (course.location || '').replace(/\s+/g, ' ').trim(),
      time: `${start}-${end}`,
    });
  }

  for (const item of schedule.special || []) {
    const weeks = parseWeekSpec(item.weeks);
    if (!weeks.includes(week)) continue;
    const wdays = Array.isArray(item.weekday) ? item.weekday.map(Number) : [Number(item.weekday)];
    if (!wdays.includes(weekday)) continue;
    for (const t of item.times || []) {
      courses.push({
        title: item.title.replace(/\s+/g, ' ').trim(),
        location: (item.location || '').replace(/\s+/g, ' ').trim(),
        time: `${t.start}-${t.end}`,
      });
    }
  }

  courses.sort((a, b) => a.time.localeCompare(b.time));
  return { courses, week, weekday };
}

// ── 作业 ──

function renderAssignments(assignments) {
  if (!assignments || !assignments.length) return '🎉 暂无待完成作业';

  const pending = assignments
    .filter(a => !a.done && a.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  if (!pending.length) return '🎉 全部作业已完成';

  const today = bjToday();
  const lines = [];

  for (const a of pending) {
    const dl = deadlineBJDateOnly(a.deadline);
    const days = diffDays(dl, today);

    let icon;
    if (days < 0) icon = '⚠️';
    else if (days === 0) icon = '🔴';
    else if (days <= 2) icon = '🟡';
    else if (days <= 5) icon = '🟢';
    else icon = '📌';

    const label = days < 0 ? `逾期 ${Math.abs(days)} 天`
      : days === 0 ? '今天截止!'
      : `剩 ${days} 天`;

    lines.push(`> [!${days < 0 || days <= 2 ? 'danger' : days <= 5 ? 'warning' : 'tip'}]- ${icon} ${a.course} · ${a.title}`);
    lines.push(`> ⏱ ${formatDeadlineBJ(a.deadline)} ｜ ${label}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── 阳光长跑 ──

function renderRunning(running) {
  if (!running || !running.records) return '暂无跑步数据';

  const records = running.records || [];
  const morning = records.filter(r => r.type === 'morning').length;
  const free = records.filter(r => r.type === 'free').length;

  const semesterStart = new Date('2026-03-02');
  const today = bjToday();
  const elapsedDays = Math.max(1, Math.floor((today.getTime() - semesterStart.getTime()) / 86400000));

  // 最后 7 天热力图
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    const rec = records.find(r => r.date === dateStr);
    if (!rec) last7.push('⬜');
    else if (rec.type === 'morning') last7.push('🟩');
    else last7.push('🟨');
  }

  const heatmap = last7.join('');

  return [
    `🌅 晨跑 **${morning}** 次 ｜ 🆓 减免 **${free}** 次`,
    `📆 已过 ${elapsedDays} 天`,
    `📊 近7天 ${heatmap} （🟩晨跑 🟨减免 ⬜未跑）`,
  ].join('\n');
}

// ── 知识空白 ──

function renderGaps(gapsData) {
  if (!gapsData || !gapsData.gaps) return '暂无知识空白分析';

  const open = (gapsData.gaps || []).filter(g => g.status === 'open');
  if (!open.length) return '🎉 所有知识空白已处理';

  const lines = [];
  for (const g of open.slice(0, 3)) {
    const prio = g.priority === 1 ? '🔴' : g.priority === 2 ? '🟡' : '🟢';
    lines.push(`> [!info]- ${prio} ${g.title}`);
    lines.push(`> ${g.why.slice(0, 80)}${g.why.length > 80 ? '...' : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ── 最近文件 ──

function renderRecentFiles(dir, label, limit) {
  if (!fs.existsSync(dir)) return `暂无${label}`;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit);

  if (!files.length) return `暂无${label}`;

  const lines = [];
  for (const f of files) {
    const name = f.replace('.md', '');
    const filePath = path.join(path.basename(dir), f).replace(/\\/g, '/');
    lines.push(`- [[${filePath}|${name}]]`);
  }
  return lines.join('\n');
}

// ── 主入口 ──

function main(argv) {
  const schedulePath = argv[2];
  const assignmentsPath = argv[3];
  const runningPath = argv[4];
  const gapsPath = argv[5];
  const dailyDir = argv[6];
  const youtubeDir = argv[7];
  const outputPath = argv[8];

  if (!schedulePath || !assignmentsPath || !outputPath) {
    console.error('Usage: generate-dashboard.js <schedule.json> <assignments.json> <running.json> <gaps.json> <日报dir> <youtube-dir> <output.md>');
    return 2;
  }

  const schedule = loadJSON(schedulePath);
  const assignments = loadJSON(assignmentsPath);
  const running = loadJSON(runningPath);
  const gaps = loadJSON(gapsPath);

  const { courses, week, weekday } = schedule
    ? getTodayCourses(schedule)
    : { courses: [], week: '?', weekday: '?' };

  const now = bjNow();
  const nowStr = `${pad2(now.getUTCMonth() + 1)}月${pad2(now.getUTCDate())}日 ${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;

  // ── 构建 Markdown（移动端优先） ──
  const parts = [];

  parts.push(`# 📊 仪表板`);
  parts.push('');
  parts.push(`> ${nowStr} 更新 ｜ 第 **${week}** 周 · ${WEEKDAY_NAMES[weekday] || '—'}`);
  parts.push('');

  // ── 今日课表 ──
  parts.push(`## 📅 今日课表`);
  parts.push('');
  if (courses.length) {
    for (const c of courses) {
      parts.push(`> [!info] ${c.time}`);
      parts.push(`> 📖 ${c.title}`);
      if (c.location) parts.push(`> 📍 ${c.location}`);
    }
  } else {
    parts.push(`> [!tip] 🎉 今天没有课，自由安排`);
  }
  parts.push('');

  // ── 作业倒计时 ──
  parts.push(`## ⏰ 作业倒计时`);
  parts.push('');
  parts.push(renderAssignments(assignments));
  parts.push('');

  // ── 阳光长跑 ──
  parts.push(`## 🏃 阳光长跑`);
  parts.push('');
  parts.push(`> [!info]- 跑步统计`);
  parts.push(`> ${renderRunning(running).replace(/\n/g, '\n> ')}`);
  parts.push('');

  // ── 知识空白 ──
  parts.push(`## 🧠 知识空白`);
  parts.push('');
  parts.push(renderGaps(gaps));
  parts.push('');

  // ── 快捷入口 ──
  parts.push(`## 🔗 快捷入口`);
  parts.push('');
  parts.push(`> [!tip]- 📝 最近日报`);
  parts.push(`> ${renderRecentFiles(dailyDir, '日报', 7).replace(/\n/g, '\n> ')}`);
  parts.push('');
  parts.push(`> [!tip]- 🎬 最近学习笔记`);
  parts.push(`> ${renderRecentFiles(youtubeDir, '笔记', 5).replace(/\n/g, '\n> ')}`);
  parts.push('');

  // ── 写入 ──
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, parts.join('\n') + '\n', 'utf8');
  console.log(`[dashboard] generated: ${outputPath}`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}
