#!/usr/bin/env node

/**
 * 周报生成 · Weekly Report Agent
 *
 * 每周自动汇总最近一周（周一到周日，北京时间）的学习与项目数据，
 * 输出到 jiangshu-study/周报/YYYY-MM-DD_YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function beijingNow() {
  const bjMs = Date.now() + CST_OFFSET_MS;
  const d = new Date(bjMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dateStr: fmtDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
  };
}

function fmtDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateOnly(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoToBeijingDate(isoStr) {
  const date = new Date(isoStr);
  const bjMs = date.getTime() + CST_OFFSET_MS;
  const bj = new Date(bjMs);
  return fmtDate(bj.getUTCFullYear(), bj.getUTCMonth() + 1, bj.getUTCDate());
}

function formatMonthDay(dateStr) {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${month}月${day}日`;
}

function getWeekRange() {
  const bj = beijingNow();
  const today = parseDateOnly(bj.dateStr);
  const dayOffset = today.getUTCDay() === 0 ? 6 : today.getUTCDay() - 1;
  const monday = new Date(today.getTime() - dayOffset * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);

  return {
    start: fmtDate(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    end: fmtDate(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate()),
  };
}

function inRange(dateStr, startDate, endDate) {
  return dateStr >= startDate && dateStr <= endDate;
}

function loadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function loadJsonObject(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function getGitWeeklyChanges(studyDir, startDate, endDate) {
  try {
    const after = `${startDate}T00:00:00+08:00`;
    const before = `${endDate}T23:59:59+08:00`;
    const output = execSync(
      `git -c core.quotepath=false log --since="${after}" --until="${before}" --pretty=format:"%h|%cI|%s" --name-only`,
      { cwd: studyDir, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 }
    ).trim();

    if (!output) {
      return { commits: [], files: [], byDay: {}, inspirationFiles: [] };
    }

    const commits = [];
    const files = new Set();
    const byDay = {};
    const inspirationFiles = new Set();
    let current = null;

    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        current = null;
        continue;
      }

      const matched = line.match(/^([a-f0-9]{7,40})\|([^|]+)\|(.+)$/);
      if (matched) {
        const beijingDate = isoToBeijingDate(matched[2]);
        current = {
          hash: matched[1],
          date: beijingDate,
          message: matched[3].trim(),
          files: [],
        };
        commits.push(current);
        byDay[current.date] = (byDay[current.date] || 0) + 1;
        continue;
      }

      if (!current) continue;
      if (/\.(exe|docx|doc|pptx|xlsx|pdf|png|jpg|jpeg|gif|ico|zip|tar|gz|tmp|o|obj|class|pyc)$/i.test(line)) continue;
      current.files.push(line);
      files.add(line);
      if (line.includes('灵感') || line.includes('日报') || line.includes('周报')) {
        inspirationFiles.add(line);
      }
    }

    return {
      commits,
      files: [...files],
      byDay,
      inspirationFiles: [...inspirationFiles],
    };
  } catch {
    return { commits: [], files: [], byDay: {}, inspirationFiles: [] };
  }
}

function getAssignmentsSummary(assignmentsPath, startDate, endDate) {
  const assignments = loadJsonArray(assignmentsPath);
  const created = assignments.filter(item => item.createdAt && inRange(item.createdAt.slice(0, 10), startDate, endDate));
  const completed = assignments.filter(item => item.submittedAt && inRange(item.submittedAt.slice(0, 10), startDate, endDate));
  const pending = assignments
    .filter(item => !item.done)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5)
    .map(item => ({
      course: item.course,
      title: item.title,
      deadline: item.deadline ? item.deadline.slice(0, 10) : '',
    }));

  return {
    createdCount: created.length,
    completedCount: completed.length,
    pending,
  };
}

function getRunningSummary(runningPath, startDate, endDate) {
  const data = loadJsonObject(runningPath);
  const records = Array.isArray(data.records) ? data.records : [];
  const weekly = records.filter(item => inRange(item.date, startDate, endDate));
  return {
    weeklyCount: weekly.length,
    morningCount: weekly.filter(item => item.type === 'morning').length,
    freeCount: weekly.filter(item => item.type === 'free').length,
  };
}

function getDailyFilesSummary(studyDir, startDate, endDate) {
  const dailyDir = path.join(studyDir, '日报');
  if (!fs.existsSync(dailyDir)) return [];

  return fs.readdirSync(dailyDir)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .map(name => name.replace(/\.md$/, ''))
    .filter(dateStr => inRange(dateStr, startDate, endDate))
    .sort();
}

async function generateAiSummary(payload) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;
  if (!deepseekKey && !glmKey) return null;

  const memoryPath = path.join(payload.studyDir, '_meta', '上下文.md');
  const memoryContext = fs.existsSync(memoryPath)
    ? fs.readFileSync(memoryPath, 'utf8').trim().slice(0, 2000)
    : '';

  const system = [
    '你是学习周报助手。',
    '请基于用户这一周的真实数据，输出简洁、具体、可执行的周报总结。',
    '不要编造不存在的数据，不要空话套话。',
    '',
    memoryContext ? '## 用户上下文' : '',
    memoryContext,
    '',
    '输出格式必须严格如下：',
    '## 本周总结',
    '2-4 句话',
    '',
    '## 下周建议',
    '3 条建议，每条一句话',
  ].join('\n');

  const user = [
    `统计周期：${payload.startDate} 到 ${payload.endDate}`,
    `提交次数：${payload.git.commits.length}`,
    `变更文件数：${payload.git.files.length}`,
    `活跃日期数：${Object.keys(payload.git.byDay).length}`,
    `本周新增作业：${payload.assignments.createdCount}`,
    `本周完成作业：${payload.assignments.completedCount}`,
    `未完成作业：${payload.assignments.pending.map(item => `${item.course}-${item.title}`).join('；') || '无'}`,
    `本周运动：${payload.running.weeklyCount} 次（晨跑 ${payload.running.morningCount} 次，自由跑 ${payload.running.freeCount} 次）`,
    `日报覆盖：${payload.dailyFiles.length} 天`,
    `灵感/复盘相关文件：${payload.git.inspirationFiles.join('；') || '无'}`,
  ].join('\n');

  const tasks = [];
  if (deepseekKey) {
    tasks.push(llmCall({
      hostname: 'api.deepseek.com',
      apiPath: '/v1/chat/completions',
      apiKey: deepseekKey,
      model: 'deepseek-chat',
      system,
      user,
    }));
  }
  if (glmKey) {
    tasks.push(llmCall({
      hostname: 'open.bigmodel.cn',
      apiPath: '/api/paas/v4/chat/completions',
      apiKey: glmKey,
      model: 'glm-4-flash',
      system,
      user,
    }));
  }

  try {
    return await Promise.any(tasks);
  } catch {
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
    max_tokens: 800,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname,
      path: apiPath,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let buffer = '';
      res.on('data', chunk => buffer += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`http_${res.statusCode}`));
        }
        try {
          const obj = JSON.parse(buffer);
          resolve((obj?.choices?.[0]?.message?.content || '').trim());
        } catch {
          reject(new Error('invalid_json'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

function buildWeeklyMarkdown(payload) {
  const now = beijingNow();
  const generatedAt = `${now.dateStr} ${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  const lines = [];

  lines.push('---');
  lines.push(`week_start: ${payload.startDate}`);
  lines.push(`week_end: ${payload.endDate}`);
  lines.push('tags: [周报]');
  lines.push('---');
  lines.push('');
  lines.push(`# 周报 · ${formatMonthDay(payload.startDate)} - ${formatMonthDay(payload.endDate)}`);
  lines.push('');

  lines.push('## 本周概览');
  lines.push(`- Git 提交 ${payload.git.commits.length} 次，涉及 ${payload.git.files.length} 个文件`);
  lines.push(`- 有记录的日报 ${payload.dailyFiles.length} 天`);
  lines.push(`- 新增作业 ${payload.assignments.createdCount} 项，完成作业 ${payload.assignments.completedCount} 项`);
  lines.push(`- 跑步 ${payload.running.weeklyCount} 次，其中晨跑 ${payload.running.morningCount} 次，自由跑 ${payload.running.freeCount} 次`);
  lines.push('');

  lines.push('## 本周活跃度');
  const activeDates = Object.keys(payload.git.byDay)
    .filter(dateStr => inRange(dateStr, payload.startDate, payload.endDate))
    .sort();

  if (activeDates.length === 0) {
    lines.push('- 本周没有检测到代码或笔记提交记录');
  } else {
    for (const dateStr of activeDates) {
      const weekday = WEEKDAY_NAMES[parseDateOnly(dateStr).getUTCDay()];
      lines.push(`- ${dateStr} ${weekday}：${payload.git.byDay[dateStr]} 次提交`);
    }
  }
  lines.push('');

  lines.push('## 本周重点文件');
  if (payload.git.files.length === 0) {
    lines.push('- 无');
  } else {
    for (const file of payload.git.files.slice(0, 15)) {
      lines.push(`- ${file}`);
    }
  }
  lines.push('');

  lines.push('## 作业进展');
  lines.push(`- 本周新增：${payload.assignments.createdCount}`);
  lines.push(`- 本周完成：${payload.assignments.completedCount}`);
  if (payload.assignments.pending.length > 0) {
    lines.push('- 当前待办：');
    for (const item of payload.assignments.pending) {
      lines.push(`  - ${item.course}｜${item.title}｜截止 ${item.deadline}`);
    }
  } else {
    lines.push('- 当前待办：无');
  }
  lines.push('');

  lines.push('## 运动进展');
  lines.push(`- 本周累计：${payload.running.weeklyCount} 次`);
  lines.push(`- 晨跑：${payload.running.morningCount} 次`);
  lines.push(`- 自由跑：${payload.running.freeCount} 次`);
  lines.push('');

  lines.push('## 日报覆盖');
  if (payload.dailyFiles.length === 0) {
    lines.push('- 本周还没有日报产物');
  } else {
    for (const dateStr of payload.dailyFiles) {
      lines.push(`- [[日报/${dateStr}|${dateStr}]]`);
    }
  }
  lines.push('');

  if (payload.aiSummary) {
    lines.push('## AI 小结');
    lines.push(payload.aiSummary);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*自动生成于 ${generatedAt}（北京时间）*`);
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const studyDir = process.env.STUDY_DIR || path.join(process.cwd(), '_study');
  const timetableDir = process.env.TIMETABLE_DIR || process.cwd();
  const assignmentsPath = path.join(timetableDir, 'data', 'assignments.json');
  const runningPath = path.join(timetableDir, 'data', 'running.json');

  const { start, end } = getWeekRange();
  console.log(`[weekly] 生成周报：${start} ~ ${end}`);

  const payload = {
    studyDir,
    startDate: start,
    endDate: end,
    git: getGitWeeklyChanges(studyDir, start, end),
    assignments: getAssignmentsSummary(assignmentsPath, start, end),
    running: getRunningSummary(runningPath, start, end),
    dailyFiles: getDailyFilesSummary(studyDir, start, end),
  };

  payload.aiSummary = await generateAiSummary(payload);

  const markdown = buildWeeklyMarkdown(payload);
  const outDir = path.join(studyDir, '周报');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${start}_${end}.md`);
  fs.writeFileSync(outPath, markdown, 'utf8');
  console.log(`[weekly] 已写入：${outPath}`);

  const pushToken = process.env.STUDY_PUSH_TOKEN;
  if (pushToken && fs.existsSync(path.join(studyDir, '.git'))) {
    const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';
    try {
      execSync('git add 周报/', { cwd: studyDir, stdio: 'pipe', timeout: 10000 });
      execSync(
        `git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" ` +
        `commit -m "weekly: ${start} to ${end}"`,
        { cwd: studyDir, stdio: 'pipe', timeout: 10000 }
      );
      const authedRepo = repo.replace('https://', `https://x-access-token:${pushToken}@`);
      execSync(`git push "${authedRepo}" HEAD:main`, { cwd: studyDir, stdio: 'pipe', timeout: 30000 });
      console.log('[weekly] 已推送');
    } catch (error) {
      const message = String((error && error.stdout) || '') + String((error && error.stderr) || '');
      if (message.includes('nothing to commit')) {
        console.log('[weekly] 无变更，跳过推送');
      } else {
        console.log(`[weekly] 推送失败：${error.message}`);
      }
    }
  }
}

main().catch(error => {
  console.error('[weekly] 错误：', error?.stack || String(error));
  process.exit(1);
});
