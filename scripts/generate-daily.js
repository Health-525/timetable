#!/usr/bin/env node

/**
 * 日报生成 · Daily Report Agent
 *
 * 每天 22:00（北京时间）自动运行，汇总当天的 Git 变更、课表、作业、跑步数据。
 * 完全自包含，不依赖项目其他模块。
 *
 * 触发方式：GitHub Actions 定时 / workflow_dispatch
 * 输出路径：jiangshu-study/日报/YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ═══════════════════════════════════════════════════════════════
// 无需外部配置 — 路径和参数全部内聚在这个脚本里
// ═══════════════════════════════════════════════════════════════

const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

// ── 北京时间工具 ──────────────────────────────────────────────
function beijingNow() {
  const bjMs = Date.now() + CST_OFFSET_MS;
  const d = new Date(bjMs);
  return {
    year:    d.getUTCFullYear(),
    month:   d.getUTCMonth() + 1,
    day:     d.getUTCDate(),
    hour:    d.getUTCHours(),
    minute:  d.getUTCMinutes(),
    weekday: d.getUTCDay(), // 0=周日
    dateStr: [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0'),
    ].join('-'),
  };
}

function fmtDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ── Git 变更提取 ──────────────────────────────────────────────
function getGitLog(studyDir) {
  const bj = beijingNow();
  // 今天 00:00 北京时间 = 昨天 16:00 UTC
  const midnightBJ = new Date(Date.UTC(bj.year, bj.month - 1, bj.day));
  const since = midnightBJ.toISOString();

  let out = '';
  try {
    out = execSync(
      `git -c core.quotepath=false log --since="${since}" --pretty=format:"%h|%s" --name-only`,
      { cwd: studyDir, encoding: 'utf8', timeout: 15000 }
    ).trim();
  } catch {
    return [];
  }

  if (!out) return [];

  const lines = out.split(/\r?\n/);
  const changes = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { current = null; continue; }
    // commit hash|message
    const commitMatch = line.match(/^([a-f0-9]{7,40})\|(.+)$/);
    if (commitMatch) {
      current = { hash: commitMatch[1], message: commitMatch[2].trim(), files: [] };
      changes.push(current);
    } else if (current) {
      current.files.push(line);
    }
  }
  return changes;
}

// ── 课程摘要（只读 schedule.json） ────────────────────────────
function getTodayCourses(schedulePath) {
  if (!fs.existsSync(schedulePath)) return [];
  const data = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
  const week1 = new Date(data.meta.week1_monday);
  const bj = beijingNow();
  const today = new Date(Date.UTC(bj.year, bj.month - 1, bj.day));

  const deltaDays = Math.floor((today - week1) / 86400000);
  const weekNum = Math.floor(deltaDays / 7) + 1;
  const wday = today.getUTCDay() === 0 ? 7 : today.getUTCDay(); // 1=周一 .. 7=周日

  const periodTimes = data.periodTimes || {};
  const courses = data.courses || [];
  const result = [];

  for (const c of courses) {
    if (parseInt(c.weekday, 10) !== wday) continue;
    const spec = c.weeks || '';
    if (!weekInSpec(spec, weekNum)) continue;
    const periods = Array.isArray(c.periods) ? c.periods.map(Number) : [];
    const ps = Math.min(...periods);
    const time = periodTimes[String(ps)]
      ? periodTimes[String(ps)].split('-')[0]
      : `第${ps}节`;
    result.push({ time, title: c.title, location: c.location, teacher: c.teacher });
  }
  result.sort((a, b) => a.time.localeCompare(b.time));
  return result;
}

function weekInSpec(spec, w) {
  for (const part of String(spec).split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(Number);
      if (w >= a && w <= b) return true;
    } else if (Number(t) === w) return true;
  }
  return false;
}

// ── 作业摘要（只读 assignments.json） ─────────────────────────
function getTodayAssignments(assignmentsPath) {
  if (!fs.existsSync(assignmentsPath)) return [];
  const list = JSON.parse(fs.readFileSync(assignmentsPath, 'utf8'));
  if (!Array.isArray(list)) return [];
  const bj = beijingNow();
  const todayMidnight = Date.UTC(bj.year, bj.month - 1, bj.day);
  const result = [];

  for (const a of list) {
    if (a.done) continue;
    const d = new Date(a.deadline);
    const dbjMs = d.getTime() + CST_OFFSET_MS;
    const dbj = new Date(dbjMs);
    const dlMidnight = Date.UTC(dbj.getUTCFullYear(), dbj.getUTCMonth(), dbj.getUTCDate());
    const diffDays = Math.round((dlMidnight - todayMidnight) / 86400000);

    let urgency = '';
    if (diffDays < 0) urgency = '⚠️ 已逾期';
    else if (diffDays === 0) urgency = '🔴 今天截止';
    else if (diffDays <= 2) urgency = `🔴 还剩${diffDays}天`;
    else if (diffDays <= 5) urgency = `🟡 还剩${diffDays}天`;
    else urgency = `🟢 还剩${diffDays}天`;

    result.push({
      course: a.course,
      title: a.title,
      deadline: fmtDateStr(dbj.getUTCFullYear(), dbj.getUTCMonth() + 1, dbj.getUTCDate()),
      urgency,
      diffDays,
    });
  }
  result.sort((a, b) => a.diffDays - b.diffDays);
  return result;
}

// ── 跑步摘要（只读 running.json） ─────────────────────────────
function getTodayRunning(runningPath) {
  if (!fs.existsSync(runningPath)) return null;
  const data = JSON.parse(fs.readFileSync(runningPath, 'utf8'));
  const records = data.records || [];
  const bj = beijingNow();
  const todayStr = bj.dateStr;

  const todayRecord = records.find(r => r.date === todayStr);
  const morningCount = records.filter(r => r.type === 'morning').length;
  const total = records.length;
  const TARGET_MORNING = 10;
  const TARGET_TOTAL = 50;

  return {
    today: todayRecord || null,
    morningCount,
    total,
    morningTarget: TARGET_MORNING,
    totalTarget: TARGET_TOTAL,
  };
}

// ── LLM 总结（可选，无 API Key 则跳过） ────────────────────────
async function generateAiSummary({ courses, assignments, changes, running }) {
  // 优先用 DEEPSEEK_API_KEY，其次 GLM_API_KEY
  // 如果都没有，静默跳过
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;
  if (!deepseekKey && !glmKey) return null;

  const changeLines = changes.flatMap(c =>
    c.files.map(f => `- ${f}`)
  ).slice(0, 15);

  const system = '你是学生的学习助手。根据今天的活动数据，用2-3句话写一段温和的复盘小结。语气像朋友，不要官腔，不要编造数据中没有的内容。50字以内。';

  const user = [
    '## 今日数据',
    `课程：${courses.length > 0 ? courses.map(c => c.title).join('、') : '无'}`,
    `作业：${assignments.length > 0 ? assignments.map(a => `${a.course}·${a.title}(${a.urgency})`).join(' / ') : '无新作业'}`,
    `Git变更：${changeLines.length > 0 ? changeLines.join(' / ') : '无'}`,
    `运动：${running?.today ? (running.today.type === 'morning' ? '晨跑' : '自由跑') + ' 1次' : '无'}`,
    '',
    '请输出总结（纯文本，不要markdown格式）：',
  ].join('\n');

  const tasks = [];
  if (deepseekKey) {
    tasks.push(
      llmCall({
        hostname: 'api.deepseek.com',
        apiPath: '/v1/chat/completions',
        apiKey: deepseekKey,
        model: 'deepseek-chat',
        system,
        user,
      }).then(r => ({ r, src: 'deepseek' }))
    );
  }
  if (glmKey) {
    tasks.push(
      llmCall({
        hostname: 'open.bigmodel.cn',
        apiPath: '/api/paas/v4/chat/completions',
        apiKey: glmKey,
        model: 'glm-4-flash',
        system,
        user,
      }).then(r => ({ r, src: 'glm' }))
    );
  }

  try {
    const { r, src } = await Promise.any(tasks);
    console.log(`[llm] 总结生成成功 (${src})`);
    return r;
  } catch {
    console.log('[llm] 总结生成失败，跳过');
    return null;
  }
}

function llmCall({ hostname, apiPath, apiKey, model, system, user }) {
  const https = require('https');
  const payload = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST', hostname, path: apiPath,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`http_${res.statusCode}`));
        }
        try {
          const obj = JSON.parse(buf);
          resolve((obj?.choices?.[0]?.message?.content || '').trim());
        } catch { reject(new Error('invalid_json')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

// ── Markdown 生成 ──────────────────────────────────────────────
function buildMarkdown({ dateStr, weekday, changes, courses, assignments, running, aiSummary }) {
  const lines = [];
  const [y, m, d] = dateStr.split('-');

  // 标题
  lines.push(`# 📅 ${parseInt(m)}月${parseInt(d)}日 · ${weekday} · 日报`);
  lines.push('');

  // 变更记录（核心）
  lines.push('## 🔄 今日变更');
  lines.push('');
  if (changes.length === 0) {
    lines.push('> 今日无 Git 提交记录');
  } else {
    for (const c of changes) {
      for (const f of c.files) {
        // 根据文件路径判断操作类型
        const isNew = c.message.includes('新增') || c.message.includes('add');
        const isDone = c.message.includes('完成') || c.message.includes('归档') ||
                       c.message.includes('打卡') || c.message.includes('跑步');
        const icon = isDone ? '✅' : isNew ? '➕' : '✏️';
        lines.push(`- ${icon} ${f} — ${c.message}`);
      }
    }
  }
  lines.push('');
  lines.push(`> 共 ${changes.length} 次提交 · ${changes.reduce((s, c) => s + c.files.length, 0)} 个文件变更`);
  lines.push('');

  // 今日课程（从schedule.json取，如果有）
  if (courses.length > 0) {
    lines.push('## 📅 今日课程');
    lines.push('');
    for (const c of courses) {
      lines.push(`- ${c.time} **${c.title}** · ${c.location}`);
    }
    lines.push('');
  }

  // 作业（从assignments.json取，只展示临近的）
  if (assignments.length > 0) {
    const urgent = assignments.filter(a => a.diffDays <= 3);
    if (urgent.length > 0) {
      lines.push('## 📝 待完成作业');
      lines.push('');
      for (const a of urgent) {
        lines.push(`- ${a.urgency} **${a.course}** · ${a.title}`);
      }
      lines.push('');
    }
  }

  // 运动（从running.json取）
  if (running) {
    lines.push('## 🏃 运动');
    lines.push('');
    if (running.today) {
      const icon = running.today.type === 'morning' ? '🌅 晨跑' : '🏃 自由跑';
      lines.push(`- 今日：${icon}`);
    } else {
      lines.push('- 今日：未记录');
    }
    const totalPct = Math.round((running.total / running.totalTarget) * 100);
    lines.push(`- 学期进度：${running.total}/${running.totalTarget}（${totalPct}%）`);
    lines.push('');
  }

  // AI 总结（如果有）
  if (aiSummary) {
    lines.push('## 🤖 AI 小结');
    lines.push('');
    lines.push(`> ${aiSummary}`);
    lines.push('');
  }

  // 页脚
  const bj = beijingNow();
  const timeStr = `${String(bj.hour).padStart(2, '0')}:${String(bj.minute).padStart(2, '0')}`;
  lines.push('---');
  lines.push(`> 由 OpenClaw 总指挥自动生成 · ${dateStr} ${timeStr}（北京时间）`);

  return lines.join('\n') + '\n';
}

// ── 主流程 ─────────────────────────────────────────────────────
async function main() {
  // 路径：所有路径均通过环境变量或默认值，不硬编码绝对路径
  const studyDir = process.env.STUDY_DIR || path.join(process.cwd(), '_study');
  const timetableDir = process.env.TIMETABLE_DIR || process.cwd();
  const schedulePath = path.join(timetableDir, 'data', 'schedule.json');
  const assignmentsPath = path.join(timetableDir, 'data', 'assignments.json');
  const runningPath = path.join(timetableDir, 'data', 'running.json');

  const bj = beijingNow();
  const dateStr = bj.dateStr;
  const weekday = WEEKDAY_NAMES[bj.weekday];

  console.log(`[daily] 生成日报：${dateStr} ${weekday}`);

  // 1. 提取 Git 变更
  console.log('[daily] 提取 Git 变更...');
  let changes = [];
  if (fs.existsSync(studyDir)) {
    changes = getGitLog(studyDir);
  } else {
    console.log('[daily] 本地无 jiangshu-study 仓库，Git 变更将为空');
  }
  console.log(`[daily] 找到 ${changes.length} 次提交`);

  // 2. 读取今日数据（只读，不修改）
  const courses = getTodayCourses(schedulePath);
  const assignments = getTodayAssignments(assignmentsPath);
  const running = getTodayRunning(runningPath);
  console.log(`[daily] 课程:${courses.length} 作业:${assignments.length} 跑步:${running?.today ? 1 : 0}`);

  // 3. LLM 总结
  const aiSummary = await generateAiSummary({ courses, assignments, changes, running });

  // 4. 生成 Markdown
  const md = buildMarkdown({ dateStr, weekday, changes, courses, assignments, running, aiSummary });

  // 5. 写入文件
  const outDir = path.join(studyDir, '日报');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${dateStr}.md`);
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`[daily] 已写入：${outPath}`);

  // 6. 如果有 push token，自动 commit + push
  const pushToken = process.env.STUDY_PUSH_TOKEN;
  if (pushToken && fs.existsSync(path.join(studyDir, '.git'))) {
    const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';
    try {
      execSync('git add 日报/', { cwd: studyDir, stdio: 'pipe', timeout: 10000 });
      execSync(
        `git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" ` +
        `commit -m "daily: ${dateStr} 日报自动生成"`,
        { cwd: studyDir, stdio: 'pipe', timeout: 10000 }
      );
      const authed = repo.replace('https://', `https://x-access-token:${pushToken}@`);
      execSync(`git push "${authed}" HEAD:main`, { cwd: studyDir, stdio: 'pipe', timeout: 30000 });
      console.log('[daily] 已推送');
    } catch (e) {
      const msg = (e.stdout || '') + (e.stderr || '');
      if (msg.includes('nothing to commit')) {
        console.log('[daily] 无变更，跳过推送');
      } else {
        console.log(`[daily] 推送失败：${e.message}`);
      }
    }
  }
}

main().catch(e => {
  console.error('[daily] 错误：', e?.stack || String(e));
  process.exit(1);
});
