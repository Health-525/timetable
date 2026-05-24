#!/usr/bin/env node
/**
 * 生成 Obsidian 仪表板 — iPhone 移动端极简排版
 * 原则：最重要信息在最上面，不用分隔线，不用嵌套，一目了然
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

function deadlineBJ(isoStr) {
  const d = new Date(isoStr);
  const bj = new Date(d.getTime() + CST_MS);
  return { text: `${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日 ${pad2(bj.getUTCHours())}:${pad2(bj.getUTCMinutes())}`, date: new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate())) };
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

const WDAY = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getWeekInfo(schedule) {
  const w1m = new Date(schedule.meta?.week1_monday || '2026-03-02');
  const today = bjToday();
  const diff = Math.floor((today.getTime() - w1m.getTime()) / (7 * 86400000));
  return { week: Math.max(1, diff + 1), weekday: bjNow().getUTCDay() || 7 };
}

function getCoursesForDay(schedule, targetWeekday) {
  const { week } = getWeekInfo(schedule);
  const pt = schedule.periodTimes || {};
  const courses = [];

  for (const c of schedule.courses || []) {
    if (Number(c.weekday) !== targetWeekday) continue;
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
    if (!wds.includes(targetWeekday)) continue;
    for (const t of s.times || []) {
      courses.push({
        title: s.title.replace(/\s+/g, ' ').trim(),
        location: (s.location || '').replace(/\s+/g, ' ').trim(),
        time: t.start,
      });
    }
  }

  courses.sort((a, b) => a.time.localeCompare(b.time));
  return courses;
}

// ── 生成函数 ──

function renderHomework(assignments) {
  if (!assignments) return null;
  const pending = assignments
    .filter(a => !a.done && a.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  if (!pending.length) return { text: '🎉 全部作业已完成', count: 0, urgent: false };

  const today = bjToday();
  const items = [];
  let urgent = false;

  for (const a of pending.slice(0, 5)) {
    const { text, date } = deadlineBJ(a.deadline);
    const days = diffDays(date, today);

    let icon;
    if (days < 0) { icon = '⚠️'; urgent = true; }
    else if (days === 0) { icon = '🔴'; urgent = true; }
    else if (days <= 2) { icon = '🟡'; urgent = true; }
    else if (days <= 5) icon = '🟢';
    else icon = '📌';

    const label = days < 0 ? `逾期${Math.abs(days)}天`
      : days === 0 ? '今天!'
      : `${days}天后`;

    items.push(`${icon} ${a.course}·${a.title} — ${label}`);
  }

  const callout = urgent ? 'danger' : pending.length >= 3 ? 'warning' : 'tip';
  return {
    text: `> [!${callout}] ⏰ ${pending.length} 项作业\n> ${items.join('\n> ')}`,
    count: pending.length,
    urgent,
  };
}

function renderSchedule(schedule) {
  if (!schedule) return null;
  const { week, weekday } = getWeekInfo(schedule);

  // 今天有课 → 显示今天；今天没课 → 显示明天/下一个上课日
  let displayDay = weekday;
  let label = '今天';
  const todayCourses = getCoursesForDay(schedule, weekday);
  if (!todayCourses.length) {
    // 找下一个有课的最近日（最多往后看7天）
    for (let offset = 1; offset <= 7; offset++) {
      const next = weekday + offset > 7 ? weekday + offset - 7 : weekday + offset;
      const courses = getCoursesForDay(schedule, next);
      if (courses.length) {
        displayDay = next;
        label = offset === 1 ? '明天' : WDAY[next];
        break;
      }
    }
  }

  const courses = getCoursesForDay(schedule, displayDay);
  if (!courses.length) return { text: '✨ 近7天没有课', week, weekday };

  const lines = [];
  for (const c of courses.slice(0, 8)) {
    const loc = c.location ? ` @${c.location}` : '';
    lines.push(`> ${c.time} ${c.title}${loc}`);
  }

  return {
    text: `> [!info] 📅 ${label}课表 · 第${week}周\n${lines.join('\n')}`,
    week,
    weekday,
  };
}

function renderRunning(running) {
  if (!running || !running.records) return null;
  const records = running.records || [];
  const morning = records.filter(r => r.type === 'morning').length;
  const free = records.filter(r => r.type === 'free').length;

  // 近7天
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(bjToday());
    d.setUTCDate(d.getUTCDate() - i);
    const ds = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    const rec = records.find(r => r.date === ds);
    cells.push(!rec ? '·' : rec.type === 'morning' ? '跑' : '免');
  }

  return `🏃 晨跑 **${morning}** \`${cells.join(' ')}\``;
}

function renderGaps(gapsData) {
  if (!gapsData || !gapsData.gaps) return null;
  const open = (gapsData.gaps || []).filter(g => g.status === 'open');
  if (!open.length) return null;
  return `🧠 ${open.length} 个知识空白待研究`;
}

function renderRecentLinks(dailyDir, youtubeDir) {
  const links = [];

  if (fs.existsSync(dailyDir)) {
    const files = fs.readdirSync(dailyDir)
      .filter(f => f.endsWith('.md'))
      .sort().reverse().slice(0, 2);
    for (const f of files) {
      const name = f.replace('.md', '');
      const short = name.slice(5); // "2026-05-24" → "05-24"
      links.push(`[[${path.join(path.basename(dailyDir), f).replace(/\\/g, '/')}|📝 ${short}]]`);
    }
  }

  if (fs.existsSync(youtubeDir)) {
    const files = fs.readdirSync(youtubeDir)
      .filter(f => f.endsWith('.md'))
      .sort().reverse().slice(0, 2);
    for (const f of files) {
      const name = f.replace('.md', '');
      const short = name.slice(5);
      links.push(`[[${path.join(path.basename(youtubeDir), f).replace(/\\/g, '/')}|🎬 ${short}]]`);
    }
  }

  return links.length ? links.join(' · ') : null;
}

// ── 主入口 ──

function main(argv) {
  const [schedulePath, assignmentsPath, runningPath, gapsPath, dailyDir, youtubeDir, outputPath] = argv.slice(2);

  if (!outputPath) { console.error('missing output path'); return 2; }

  const schedule = loadJSON(schedulePath);
  const assignments = loadJSON(assignmentsPath);
  const running = loadJSON(runningPath);
  const gaps = loadJSON(gapsPath);

  const now = bjNow();
  const nowStr = `${pad2(now.getUTCMonth() + 1)}月${pad2(now.getUTCDate())}日 ${WDAY[getWeekInfo(schedule || { meta: { week1_monday: '2026-03-02' } }).weekday]}`;

  const hw = renderHomework(assignments);
  const sc = renderSchedule(schedule);
  const run = renderRunning(running);
  const gap = renderGaps(gaps);
  const links = renderRecentLinks(dailyDir, youtubeDir);

  const out = [];

  // 标题行
  out.push(`# ${nowStr}`);
  out.push('');

  // 作业 — 最重要，放最前面
  if (hw && hw.text) { out.push(hw.text); out.push(''); }

  // 课表
  if (sc && sc.text) { out.push(sc.text); out.push(''); }

  // 跑步 + 知识空白 — 一行一条
  if (run) { out.push(run); out.push(''); }
  if (gap) { out.push(gap); out.push(''); }

  // 快捷入口
  if (links) { out.push(links); out.push(''); }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, out.join('\n'), 'utf8');
  console.log(`[dashboard] generated: ${outputPath}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
