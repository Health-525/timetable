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
const comm = require('./lib/agent-comm');

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

// ── Git 变更提取（含 diff 内容）───────────────────────────────
function getGitChanges(studyDir) {
  const bj = beijingNow();
  const midnightBJ = new Date(Date.UTC(bj.year, bj.month - 1, bj.day));
  const since = midnightBJ.toISOString();

  // 第一步：拿今天的 commit 和文件列表
  let logOut = '';
  try {
    logOut = execSync(
      `git -c core.quotepath=false log --since="${since}" --pretty=format:"%h|%s" --name-only`,
      { cwd: studyDir, encoding: 'utf8', timeout: 15000 }
    ).trim();
  } catch { return { commits: [], files: [], diffs: {} }; }

  if (!logOut) return { commits: [], files: [], diffs: {} };

  const lines = logOut.split(/\r?\n/);
  const commits = [];
  const fileSet = new Set();
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { current = null; continue; }
    const m = line.match(/^([a-f0-9]{7,40})\|(.+)$/);
    if (m) {
      current = { hash: m[1], message: m[2].trim(), files: [] };
      commits.push(current);
    } else if (current) {
      // 跳过二进制和临时文件
      if (/\.(exe|docx|doc|pptx|xlsx|pdf|png|jpg|jpeg|gif|ico|zip|tar|gz|tmp|o|obj|class|pyc)$/i.test(line)) continue;
      if (line.startsWith('~$')) continue;
      current.files.push(line);
      fileSet.add(line);
    }
  }

  // 第二步：对每个文件获取今天的 diff（截断防止过大）
  const diffs = {};
  for (const file of fileSet) {
    try {
      const raw = execSync(
        `git -c core.quotepath=false log -p --since="${since}" -- "${file}"`,
        { cwd: studyDir, encoding: 'utf8', timeout: 10000, maxBuffer: 512 * 1024 }
      );
      // 只保留实际变更行（+/-），去掉 commit 元信息和 diff 头
      const changeLines = raw.split(/\r?\n/)
        .filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l) && !/^\+\+\+ /.test(l) && !/^--- /.test(l))
        .slice(0, 60)  // 最多 60 行变更
        .join('\n');
      if (changeLines.trim()) {
        diffs[file] = changeLines.slice(0, 3000); // 最多 3000 字符
      }
    } catch { /* 跳过获取失败的文件 */ }
  }

  return { commits, files: [...fileSet], diffs };
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

// ── LLM 变更描述（可选） ────────────────────────────────────────
async function summarizeChanges(diffs) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;
  if (!deepseekKey && !glmKey) return {};
  const files = Object.keys(diffs);
  if (files.length === 0) return {};

  const system = '你是代码仓库分析助手。用户会提供 git diff 内容，请用简洁的中文描述每个文件改了什么。注意：不要猜测，只根据 diff 内容描述。';

  const parts = [];
  for (const [file, diff] of Object.entries(diffs)) {
    parts.push(`### ${file}\n\`\`\`diff\n${diff.slice(0, 1500)}\n\`\`\``);
  }

  const user = [
    '请描述以下每个文件的变更。输出 JSON，key 是文件路径，value 是一句话中文描述：',
    '',
    ...parts,
  ].join('\n');

  const tasks = [];
  if (deepseekKey) {
    tasks.push(llmCall({
      hostname: 'api.deepseek.com', apiPath: '/v1/chat/completions',
      apiKey: deepseekKey, model: 'deepseek-chat',
      system, user,
    }).then(r => ({ r, src: 'deepseek' })));
  }
  if (glmKey) {
    tasks.push(llmCall({
      hostname: 'open.bigmodel.cn', apiPath: '/api/paas/v4/chat/completions',
      apiKey: glmKey, model: 'glm-4-flash',
      system, user,
    }).then(r => ({ r, src: 'glm' })));
  }

  try {
    const { r, src } = await Promise.any(tasks);
    console.log(`[llm] 变更描述成功 (${src})`);
    // 尝试解析 JSON；如果 LLM 没按规矩来，用原始文本
    try {
      const parsed = JSON.parse(r);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
    return { _raw: r };
  } catch {
    console.log('[llm] 变更描述失败，使用 commit message');
    return {};
  }
}

// ── LLM 灵感分析 + 整体总结 ──────────────────────────────────
async function generateAiSummary({ courses, assignments, changes, fileSummaries, running, studyDir }) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;
  if (!deepseekKey && !glmKey) return null;

  // 读取用户记忆文件（如果存在）
  const memoryPath = path.join(studyDir, '_meta', '上下文.md');
  let memoryContext = '';
  if (fs.existsSync(memoryPath)) {
    memoryContext = fs.readFileSync(memoryPath, 'utf8').trim().slice(0, 2000);
    console.log('[daily] 已加载记忆文件（_meta/上下文.md）');
  }

  // 提取灵感目录下的变更（文件名或路径包含"灵感"）
  const inspirationFiles = changes.files.filter(f => f.includes('灵感'));
  const inspirationDiffs = {};
  for (const f of inspirationFiles) {
    if (changes.diffs[f]) inspirationDiffs[f] = changes.diffs[f];
  }

  const system = [
    '你是学生的学习教练兼灵感分析师。你的任务有两部分：',
    '1. 用1-2句话总结今天的整体状态',
    '2. 重点分析用户今天记录的灵感/想法，给出深度建议',
    '',
    memoryContext ? '## 关于用户（上下文记忆）' : '',
    memoryContext ? memoryContext : '',
    memoryContext ? '' : '',
    '要求：',
    '- 灵感分析：如果用户写了零散的想法，帮他找到关联、提炼核心方向、给出可行的下一步',
    '- 建议要具体，不能空泛。比如"可以开发一个skill"而不要说"可以继续思考"',
    '- 如果用户有正在进行的项目或目标（见上下文记忆），将灵感与这些目标关联起来',
    '- 语气像朋友，不要官腔',
    '- 不要编造数据中没有的内容',
    '',
    '输出格式（严格遵循）：',
    '## 今日小结',
    '（1-2句话）',
    '',
    '## 灵感分析',
    '（如果没有灵感内容，写"今天没有记录灵感"）',
    '（如果有灵感内容，逐条分析 + 给建议）',
  ].join('\n');

  const parts = ['## 今日数据'];
  parts.push(`课程：${courses.length > 0 ? courses.map(c => c.title).join('、') : '无'}`);
  parts.push(`作业：${assignments.length > 0 ? assignments.map(a => `${a.course}·${a.title}(${a.urgency})`).join(' / ') : '无'}`);
  parts.push(`运动：${running?.today ? (running.today.type === 'morning' ? '晨跑' : '自由跑') + ' 1次' : '未记录'}`);

  // 附上灵感文件的 diff 内容
  if (Object.keys(inspirationDiffs).length > 0) {
    parts.push('');
    parts.push('## 今日灵感内容（git diff）');
    for (const [file, diff] of Object.entries(inspirationDiffs)) {
      // 只取新增行（+开头），去掉 diff 格式噪音
      const added = diff.split('\n')
        .filter(l => l.startsWith('+') && !l.startsWith('+++'))
        .map(l => l.slice(1)) // 去掉 + 前缀
        .filter(l => l.trim())
        .join('\n');
      parts.push(`### ${file}`);
      parts.push(added || diff.slice(0, 500));
    }
  }

  const user = parts.join('\n');

  const tasks = [];
  if (deepseekKey) {
    tasks.push(llmCall({
      hostname: 'api.deepseek.com', apiPath: '/v1/chat/completions',
      apiKey: deepseekKey, model: 'deepseek-chat',
      system, user,
    }).then(r => ({ r, src: 'deepseek' })));
  }
  if (glmKey) {
    tasks.push(llmCall({
      hostname: 'open.bigmodel.cn', apiPath: '/api/paas/v4/chat/completions',
      apiKey: glmKey, model: 'glm-4-flash',
      system, user,
    }).then(r => ({ r, src: 'glm' })));
  }

  try {
    const { r, src } = await Promise.any(tasks);
    console.log(`[llm] 总结+灵感分析成功 (${src})`);
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
    max_tokens: 1000,
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

// ── 进度条工具 ──────────────────────────────────────────────────
function progressBar(current, target, width) {
  const filled = Math.round(Math.min(current / target, 1) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ── Markdown 生成 ──────────────────────────────────────────────
function buildMarkdown({ dateStr, weekday, changes, fileSummaries, courses, assignments, running, aiSummary }) {
  const lines = [];
  const [y, m, d] = dateStr.split('-');
  const urgent = assignments.filter(a => a.diffDays <= 3);
  const bj = beijingNow();
  const timeStr = `${String(bj.hour).padStart(2, '0')}:${String(bj.minute).padStart(2, '0')}`;

  // ── YAML Frontmatter ──
  lines.push('---');
  lines.push(`date: ${dateStr}`);
  lines.push(`weekday: ${weekday}`);
  lines.push('tags: [日报]');
  lines.push('---');
  lines.push('');

  // ── 标题 ──
  lines.push(`# 📅 ${y}年${parseInt(m)}月${parseInt(d)}日 · ${weekday}`);
  lines.push('');

  // ── 今日概览 ──
  lines.push('> [!SUMMARY] 今日概览');
  lines.push('>');
  if (courses.length > 0) {
    lines.push(`> - 📚 **${courses.length} 门课**：${courses.map(c => c.title).join('、')}`);
  } else {
    lines.push('> - 📚 **今日无课**');
  }
  if (urgent.length > 0) {
    lines.push(`> - 📝 **${urgent.length} 项紧急作业**：${urgent.map(a => a.title).join('、')}`);
  } else {
    lines.push('> - 📝 **无紧急待办** ✅');
  }
  if (changes.commits.length > 0) {
    lines.push(`> - 🔄 **${changes.commits.length} 次提交** · ${changes.files.length} 个文件变更`);
  } else {
    lines.push('> - 🔄 今日无代码提交');
  }
  if (running) {
    const totalPct = Math.round((running.total / running.totalTarget) * 100);
    lines.push(`> - 🏃 **运动**：${running.total}/${running.totalTarget}（${totalPct}%）`);
  }
  lines.push('');

  // ── 今日变更 ──
  lines.push('> [!NOTE] 🔄 今日变更');
  if (changes.files.length === 0) {
    lines.push('> 今日无 Git 提交记录');
  } else {
    for (const f of changes.files) {
      const desc = (fileSummaries && fileSummaries[f]) || '';
      const isNew = changes.diffs[f] && /^\+/.test(changes.diffs[f]) &&
                    !changes.diffs[f].includes('\n-');
      const icon = isNew ? '➕' : '✏️';
      if (desc) {
        lines.push(`> - ${icon} **${f}** — ${desc}`);
      } else {
        lines.push(`> - ${icon} **${f}**`);
      }
    }
    lines.push('>');
    lines.push(`> *共 ${changes.commits.length} 次提交 · ${changes.files.length} 个文件变更*`);
  }
  lines.push('');

  // ── 今日课程 ──
  if (courses.length > 0) {
    lines.push('> [!INFO] 📅 今日课程');
    lines.push('>');
    lines.push('> | 时间 | 课程 | 地点 |');
    lines.push('> |:---:|---|:---:|');
    for (const c of courses) {
      lines.push(`> | ${c.time} | **${c.title}** | ${c.location} |`);
    }
    lines.push('');
  }

  // ── 待完成作业 ──
  if (urgent.length > 0) {
    lines.push('> [!WARNING] 📝 待完成作业');
    for (const a of urgent) {
      lines.push(`> - ${a.urgency} **${a.course}** · ${a.title}`);
    }
    lines.push('');
  }

  // ── 运动 ──
  if (running) {
    const totalPct = Math.round((running.total / running.totalTarget) * 100);
    lines.push('> [!ABSTRACT] 🏃 运动');
    lines.push('>');
    if (running.today) {
      const icon = running.today.type === 'morning' ? '🌅 晨跑' : '🏃 自由跑';
      lines.push(`> **今日**：${icon} ✓`);
    } else {
      lines.push('> **今日**：未记录');
    }
    lines.push('>');
    lines.push(`> **学期进度**：${running.total} / ${running.totalTarget}`);
    lines.push('>');
    lines.push(`> \`${progressBar(running.total, running.totalTarget, 20)}\` ${totalPct}%`);
    lines.push('');
  }

  // ── AI 小结 ──
  if (aiSummary) {
    lines.push('> [!TIP] 🤖 AI 小结');
    lines.push('>');
    const summaryLines = aiSummary.split('\n');
    for (const line of summaryLines) {
      if (line.trim()) {
        lines.push(`> ${line}`);
      } else {
        lines.push('>');
      }
    }
    lines.push('');
  }

  // ── 页脚 ──
  lines.push('---');
  lines.push('');
  lines.push(`*由 OpenClaw 总指挥自动生成 · ${dateStr} ${timeStr}（北京时间）*`);

  return lines.join('\n') + '\n';
}

// ── 主流程 ─────────────────────────────────────────────────────
async function main() {
  const ctx = comm.preflight('daily-reporter', { timetableDir: process.cwd() });
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

  // 1. 提取 Git 变更（含 diff）
  console.log('[daily] 提取 Git 变更...');
  let changes = { commits: [], files: [], diffs: {} };
  if (fs.existsSync(studyDir)) {
    changes = getGitChanges(studyDir);
  } else {
    console.log('[daily] 本地无 jiangshu-study 仓库，Git 变更将为空');
  }
  console.log(`[daily] 找到 ${changes.commits.length} 次提交，${changes.files.length} 个文件`);

  // 2. LLM 总结每项变更（有 diff 才调）
  let fileSummaries = {};
  if (Object.keys(changes.diffs).length > 0) {
    fileSummaries = await summarizeChanges(changes.diffs);
  }

  // 3. 读取今日数据（只读，不修改）
  const courses = getTodayCourses(schedulePath);
  const assignments = getTodayAssignments(assignmentsPath);
  const running = getTodayRunning(runningPath);
  console.log(`[daily] 课程:${courses.length} 作业:${assignments.length} 跑步:${running?.today ? 1 : 0}`);

  // 4. LLM 总结合成
  const aiSummary = await generateAiSummary({ courses, assignments, changes, fileSummaries, running, studyDir });

  // 4. 生成 Markdown
  const md = buildMarkdown({ dateStr, weekday, changes, fileSummaries, courses, assignments, running, aiSummary });

  // 5. 写入文件
  const outDir = path.join(studyDir, '日报');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${dateStr}.md`);
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`[daily] 已写入：${outPath}`);

  // 6. 发布由 workflow 负责，这里只生成日报文件

  comm.postflight('daily-reporter', {
    success: true,
    summary: { commits: changes.commits.length, files: changes.files.length, courses: courses.length },
  }, { timetableDir: process.cwd() });
}

main().catch(e => {
  console.error('[daily] 错误：', e?.stack || String(e));
  comm.postflight('daily-reporter', {
    success: false,
    errors: [String(e)],
  }, { timetableDir: process.cwd() });
  process.exit(1);
});
