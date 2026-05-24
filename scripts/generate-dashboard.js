#!/usr/bin/env node
/**
 * 生成 Obsidian 仪表板 — 扁平排版，移动端优先
 */

const fs = require('fs');
const path = require('path');

const CST_MS = 8 * 60 * 60 * 1000;

function bjNow() { return new Date(Date.now() + CST_MS); }
function bjToday() {
  const d = bjNow();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function diffDays(a, b) { return Math.round((a.getTime() - b.getTime()) / 86400000); }
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

function loadJSON(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseWeekSpec(spec) {
  const weeks = [];
  for (const part of String(spec || '').split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(Number);
      for (let w = a; w <= b; w++) weeks.push(w);
    } else weeks.push(Number(t));
  }
  return weeks;
}

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// ── 课表 ──

const WDAY = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getCurrentWeek(schedule) {
  const w1m = new Date(schedule.meta?.week1_monday || '2026-03-02');
  const today = bjToday();
  const diff = Math.floor((today.getTime() - w1m.getTime()) / (7 * 86400000));
  return { week: Math.max(1, diff + 1), weekday: bjNow().getUTCDay() || 7 };
}

function getTodayCourses(schedule) {
  const { week, weekday } = getCurrentWeek(schedule);
  const pt = schedule.periodTimes || {};
  const courses = [];

  for (const c of schedule.courses || []) {
    if (Number(c.weekday) !== weekday) continue;
    if (!parseWeekSpec(c.weeks).includes(week)) continue;
    const ps = Array.isArray(c.periods) ? c.periods : [];
    const tw = pt[String(ps[0])] || '';
    const [start] = tw ? tw.split('-').map(s => s.trim()) : ['?'];
    courses.push({
      title: c.title.replace(/\s+/g, ' ').trim(),
      location: (c.location || '').replace(/\s+/g, ' ').trim(),
      time: start,
    });
  }

  for (const s of schedule.special || []) {
    if (!parseWeekSpec(s.weeks).includes(week)) continue;
    const wds = Array.isArray(s.weekday) ? s.weekday.map(Number) : [Number(s.weekday)];
    if (!wds.includes(weekday)) continue;
    for (const t of s.times || []) {
      courses.push({
        title: s.title.replace(/\s+/g, ' ').trim(),
        location: (s.location || '').replace(/\s+/g, ' ').trim(),
        time: t.start,
      });
    }
  }

  courses.sort((a, b) => a.time.localeCompare(b.time));
  return { courses, week, weekday };
}

// ── 作业 ──

function hwCallout(days) {
  if (days < 0) return 'danger';
  if (days <= 2) return 'danger';
  if (days <= 5) return 'warning';
  return 'tip';
}

function hwIcon(days) {
  if (days < 0) return '⚠️';
  if (days === 0) return '🔴';
  if (days <= 2) return '🟡';
  if (days <= 5) return '🟢';
  return '📌';
}

function hwLabel(days) {
  if (days < 0) return `逾期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天截止';
  return `还剩 ${days} 天`;
}

function renderAssignments(assignments) {
  if (!assignments || !assignments.length) return '';
  const pending = assignments.filter(a => !a.done && a.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  if (!pending.length) return '';

  const today = bjToday();
  const lines = [];
  for (const a of pending) {
    const days = diffDays(deadlineBJDateOnly(a.deadline), today);
    lines.push(`> [!${hwCallout(days)}] ${hwIcon(days)} ${a.course} **·** ${a.title}`);
    lines.push(`> 📅 ${formatDeadlineBJ(a.deadline)} **·** ${hwLabel(days)}`);
    if (a.note) lines.push(`> ${a.note}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ── 跑步 ──

function renderRunning(running) {
  if (!running || !running.records) return '';

  const records = running.records || [];
  const morning = records.filter(r => r.type === 'morning').length;
  const free = records.filter(r => r.type === 'free').length;

  const semStart = new Date('2026-03-02');
  const elapsed = Math.max(1, Math.floor((bjToday().getTime() - semStart.getTime()) / 86400000));

  // 近14天 mini 热力图
  const cells = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(bjToday());
    d.setUTCDate(d.getUTCDate() - i);
    const ds = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    const rec = records.find(r => r.date === ds);
    cells.push(!rec ? '⬜' : rec.type === 'morning' ? '🟩' : '🟨');
  }

  return [
    `🌅 晨跑 **${morning}** 次　🆓 减免 **${free}** 次　📆 已过 ${elapsed} 天`,
    `\`${cells.join('')}\``,
  ].join('\n');
}

// ── 知识空白 ──

function renderGaps(gapsData) {
  if (!gapsData || !gapsData.gaps) return '';
  const open = (gapsData.gaps || []).filter(g => g.status === 'open').slice(0, 3);
  if (!open.length) return '';

  const lines = [];
  for (const g of open) {
    const prio = g.priority === 1 ? '🔴' : g.priority === 2 ? '🟡' : '🟢';
    const desc = g.why.length > 80 ? g.why.slice(0, 80) + '...' : g.why;
    lines.push(`> [!info] ${prio} ${g.title}`);
    lines.push(`> ${desc}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ── 最近文件 ──

function renderRecent(dir, limit) {
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort().reverse().slice(0, limit);
  if (!files.length) return '';

  const lines = [];
  for (const f of files) {
    const name = f.replace('.md', '');
    const fp = path.join(path.basename(dir), f).replace(/\\/g, '/');
    lines.push(`- [[${fp}|${name}]]`);
  }
  return lines.join('\n');
}

// ── AI 热点 ──

function renderAINews(newsPath) {
  const news = loadJSON(newsPath);
  if (!news || !news.length) return '';
  const lines = [];
  for (const item of news.slice(0, 6)) {
    const title = item.title || '';
    const url = item.url || '';
    const link = url ? `[${title}](${url})` : title;
    lines.push(`- ${link}`);
  }
  lines.push('');
  lines.push('📎 来自 [AIHOT](https://aihot.virxact.com/)');
  return lines.join('\n');
}

// ── 主入口 ──

function main(argv) {
  const rest = argv.slice(2);
  // 支持 7 参数（无 ai_news）和 8 参数（有 ai_news）
  const outputPath = rest[rest.length - 1];
  const aiNewsPath = rest.length >= 8 ? rest[rest.length - 2] : null;
  const [schedulePath, assignmentsPath, runningPath, gapsPath, dailyDir, youtubeDir] = rest;

  if (!schedulePath || !assignmentsPath || !outputPath) {
    console.error('Usage: generate-dashboard.js <schedule.json> <assignments.json> <running.json> <gaps.json> <日报dir> <youtube-dir> [ai_news.json] <output.md>');
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
  const nowStr = `${pad2(now.getUTCMonth() + 1)}月${pad2(now.getUTCDate())}日 ${WDAY[weekday]} · 第${week}周 · ${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;

  const hwSection = renderAssignments(assignments);
  const runSection = renderRunning(running);
  const gapSection = renderGaps(gaps);
  const dailyLinks = renderRecent(dailyDir, 5);
  const youtubeLinks = renderRecent(youtubeDir, 5);

  const out = [];

  out.push(`# 📊 仪表板`);
  out.push('');
  out.push(`\`${nowStr}\``);
  out.push('');

  // ── 今日课表 ──
  out.push(`---`);
  out.push(`## 📅 今日课表`);
  out.push('');
  if (courses.length) {
    for (const c of courses) {
      out.push(`> [!info] ${c.time} — ${c.title}`);
      if (c.location) out.push(`> 📍 ${c.location}`);
    }
  } else {
    out.push(`✨ 今天没有课，自由安排`);
  }

  // ── AI 热点 ──
  const aiNewsSection = aiNewsPath ? renderAINews(aiNewsPath) : '';
  if (aiNewsSection) {
    out.push('');
    out.push(`---`);
    out.push(`## 🤖 AI 热点`);
    out.push('');
    out.push(aiNewsSection);
  }

  // ── 作业倒计时 ──
  if (hwSection) {
    out.push('');
    out.push(`---`);
    out.push(`## ⏰ 作业倒计时`);
    out.push('');
    out.push(hwSection);
  }

  // ── 阳光长跑 ──
  if (runSection) {
    out.push('');
    out.push(`---`);
    out.push(`## 🏃 阳光长跑`);
    out.push('');
    out.push(runSection);
  }

  // ── 知识空白 ──
  if (gapSection) {
    out.push('');
    out.push(`---`);
    out.push(`## 🧠 知识空白`);
    out.push('');
    out.push(gapSection);
  }

  // ── 最近 ──
  if (dailyLinks || youtubeLinks) {
    out.push('');
    out.push(`---`);
    out.push(`## 📝 最近`);
    out.push('');
    if (dailyLinks) out.push(dailyLinks);
    if (dailyLinks && youtubeLinks) out.push('');
    if (youtubeLinks) out.push(youtubeLinks);
  }

  out.push('');

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, out.join('\n'), 'utf8');
  console.log(`[dashboard] generated: ${outputPath}`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}
