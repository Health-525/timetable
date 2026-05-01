#!/usr/bin/env node

/**
 * 自主研究 Agent · Autonomous Research Agent
 *
 * 每周二、周五自动运行（北京时间 21:00），读取知识空白分析结果，
 * 自动搜索网络资料，调用 LLM 生成学习笔记，自我评分后决定是否提交。
 *
 * 核心理念：Andrej Karpathy 的 "git ratchet" 模式 ——
 *   每个提交必须让知识库向前进步，如果质量不够就重试，重试不够就标记失败。
 *
 * 输入（环境变量）：
 *   STUDY_DIR         — jiangshu-study 仓库本地路径
 *   DEEPSEEK_API_KEY  — DeepSeek API Key（主）
 *   GLM_API_KEY       — GLM API Key（备用）
 *   STUDY_PUSH_TOKEN  — GitHub Push Token（git push 用）
 *   STUDY_REPO        — 仓库 URL（可选）
 *
 * 输入文件：
 *   _out/learning_gaps.json
 *   _meta/知识画像.md（用户知识画像）
 *
 * 输出路径：jiangshu-study/08-AI学习/自主研究/{title}.md
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// ═══════════════════════════════════════════════════════════════
// 路径与配置
// ═══════════════════════════════════════════════════════════════

const STUDY_DIR = process.env.STUDY_DIR || path.join(process.cwd(), '_study');
const OUT_DIR = path.join(process.cwd(), '_out');
const GAPS_PATH = path.join(OUT_DIR, 'learning_gaps.json');
const PROFILE_PATH = path.join(STUDY_DIR, '_meta', '知识画像.md');
const NOTE_OUT_DIR = path.join(STUDY_DIR, '08-AI学习', '自主研究');

const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

const CONFIG = {
  MAX_RETRIES: 3,
  SCORE_THRESHOLD: 70,
  MAX_SEARCH_RESULTS: 5,
};

const NOTE_TEMPLATE = `---
created: {date}
source: auto_research
gap_id: {gapId}
score: {score}
search_fallback: {searchFallback}
---

# {title}

## 从你已知的开始
{prereqs}

## 核心推导
{derivation}

## 代码验证
{code}

## 与你的课程连接
{connections}
`;

const RETRY_STRATEGIES = [
  { searchVariant: 0, promptTweak: null },
  { searchVariant: 1, promptTweak: '请更注重数学推导，减少概念性描述。务必给出完整的公式推导过程。' },
  { searchVariant: 2, promptTweak: '请用更简单的语言解释，多举具体例子，减少抽象术语。从最基础的概念讲起。' },
];

// 搜索缓存（同一次运行内不重复抓取同一 URL）
const searchCache = new Map();

// ═══════════════════════════════════════════════════════════════
// 北京时间工具
// ═══════════════════════════════════════════════════════════════

function beijingNow() {
  const bjMs = Date.now() + CST_OFFSET_MS;
  const d = new Date(bjMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dateStr: [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0'),
    ].join('-'),
  };
}

// ═══════════════════════════════════════════════════════════════
// Google 搜索结果解析
// ═══════════════════════════════════════════════════════════════

function parseGoogleResults(html) {
  const results = [];

  // Google 结果链接格式: <a href="/url?q=REAL_URL&..."
  const linkRegex = /<a href="\/url\?q=(https?:\/\/[^"&]+)/g;
  const links = [];
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const url = decodeURIComponent(m[1]);
    // 去重
    if (!links.includes(url)) {
      links.push(url);
    }
  }

  // 标题通常在 <h3> 标签内
  const titleRegex = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const titles = [];
  while ((m = titleRegex.exec(html)) !== null) {
    // 去除 HTML 标签，保留纯文本
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text && !text.includes('<')) {
      titles.push(text);
    }
  }

  // 摘要通常在包含 class 的 div 中
  const snippetRegex = /<div[^>]*class="[^"]*BNeawe[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  const snippets = [];
  while ((m = snippetRegex.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text && text.length > 20) {
      snippets.push(text);
    }
  }

  // 配对：按顺序将 link 和 title 组合
  const count = Math.min(links.length, titles.length, CONFIG.MAX_SEARCH_RESULTS);
  for (let i = 0; i < count; i++) {
    results.push({
      title: titles[i] || `Result ${i + 1}`,
      link: links[i] || '',
      snippet: snippets[i] || '',
    });
  }

  // 如果上面没配对成功（可能有真实结果但格式不同），尝试更宽松的匹配
  if (results.length === 0 && links.length > 0) {
    // Google 搜索结果链接后面通常跟一段描述文字
    const descRegex = /<div[^>]*class="[^"]*BNeawe[^"]*"[^>]*>/gi;
    // 尝试用更简单的方式：只返回链接
    for (let i = 0; i < Math.min(links.length, CONFIG.MAX_SEARCH_RESULTS); i++) {
      results.push({
        title: `Search Result ${i + 1}`,
        link: links[i],
        snippet: '',
      });
    }
  }

  return results.slice(0, CONFIG.MAX_SEARCH_RESULTS);
}

// ═══════════════════════════════════════════════════════════════
// Google 搜索（带缓存，带优雅降级）
// ═══════════════════════════════════════════════════════════════

function googleSearch(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  // 检查缓存
  if (searchCache.has(url)) {
    console.log(`[auto_research] 使用缓存搜索结果: "${query.slice(0, 40)}..."`);
    return Promise.resolve(searchCache.get(url));
  }

  console.log(`[auto_research] 搜索: "${query.slice(0, 60)}..."`);

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      timeout: 15000,
    }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => {
        if (res.statusCode !== 200 || buf.length < 500) {
          console.log(`[auto_research] Google 搜索失败 (status=${res.statusCode}, len=${buf.length})，返回空结果`);
          const empty = [];
          searchCache.set(url, empty);
          resolve(empty);
          return;
        }

        const results = parseGoogleResults(buf);
        console.log(`[auto_research] Google 返回 ${results.length} 条结果`);
        searchCache.set(url, results);
        resolve(results);
      });
    });

    req.on('error', (e) => {
      console.log(`[auto_research] Google 搜索网络错误：${e.message}`);
      const empty = [];
      searchCache.set(url, empty);
      resolve(empty);
    });

    req.on('timeout', () => {
      console.log('[auto_research] Google 搜索超时');
      req.destroy();
      const empty = [];
      searchCache.set(url, empty);
      resolve(empty);
    });

    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// 生成搜索查询
// ═══════════════════════════════════════════════════════════════

function buildSearchQueries(gap, variant) {
  const base = gap.suggestedTopic || gap.title;
  const prereqStr = (gap.prerequisites_met || []).slice(0, 2).join(' ');

  const queries = [
    `${base} 教程 数学推导`,
    `${base} 详解 ${prereqStr}`,
    `${base} 代码实现 入门`,
  ];

  // variant 决定用哪个查询（也支持轮换）
  const idx = variant % queries.length;
  return [queries[idx]];
}

// ═══════════════════════════════════════════════════════════════
// LLM 调用工具（与 analyze_knowledge.js 完全一致的风格）
// ═══════════════════════════════════════════════════════════════

function llmCall({ hostname, apiPath, apiKey, model, system, user, maxTokens }) {
  const payload = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    max_tokens: maxTokens || 4000,
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
    }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`http_${res.statusCode}`));
        }
        try {
          const obj = JSON.parse(buf);
          resolve((obj?.choices?.[0]?.message?.content || '').trim());
        } catch {
          reject(new Error('invalid_json'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// LLM 生成学习笔记
// ═══════════════════════════════════════════════════════════════

async function generateNote({ gap, profileMarkdown, searchResults, searchFallback, retryInfo }) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;

  if (!deepseekKey && !glmKey) {
    console.log('[auto_research] 无 API Key，跳过 LLM 生成');
    return null;
  }

  const system = [
    '你是学生的学习导师。根据用户的知识空白和学习资料，生成一份结构化的学习笔记。',
    '',
    '## 用户知识空白背景',
    `- 空白标题：${gap.title}`,
    `- 为什么是空白：${gap.why}`,
    `- 用户已掌握的前置知识：${(gap.prerequisites_met || []).join('、')}`,
    `- 用户缺少的内容：${gap.suggestedTopic}`,
    '',
    '## 写作要求',
    '1. **从用户已知的开始**：先回顾用户已经掌握的前置知识，以此作为新知识的起点',
    '2. **核心推导**：逐步推导新概念，建立从已知到未知的桥梁。如果有数学公式，给出完整推导',
    '3. **代码验证**：给出可运行的代码示例（Python 或 JavaScript），让用户能动手验证',
    '4. **课程连接**：解释新知识与用户已有课程、项目的关联',
    '5. **禁止重复已知内容**：不要长篇重复用户已经掌握的内容，只做简短回顾',
    '6. **语言**：中文为主，技术术语保留英文',
    '',
    '## 风格',
    '- 像老师在教学生，而不是在写维基百科',
    '- 多用"你已经知道...，现在我们来..."的句式',
    '- 代码要有注释',
    '- 公式用 LaTeX 语法（Obsidian 兼容）',
    '',
    '## 输出格式',
    '用 Markdown 写，结构如下（但不要输出 YAML frontmatter，系统会自动添加）：',
    '',
    '# [标题]',
    '',
    '## 从你已知的开始',
    '回顾用户已掌握的知识，作为起点...',
    '',
    '## 核心推导',
    '从已知到未知的逐步推导...',
    '',
    '## 代码验证',
    '可运行的代码示例...',
    '',
    '## 与你的课程连接',
    '与现有课程、项目的关联...',
  ].join('\n');

  // 构建搜索结果文本
  let searchText = '';
  if (searchFallback) {
    searchText = '[LLM知识模式] 无搜索结果，请基于你自己的知识生成笔记';
  } else if (searchResults.length === 0) {
    searchText = '[搜索不可用] LLM 请基于你自己的知识生成笔记';
  } else {
    searchText = searchResults.map((r, i) =>
      `${i + 1}. **${r.title}**\n   链接：${r.link}\n   摘要：${r.snippet}`
    ).join('\n\n');
  }

  let userPrompt = [
    '## 学习主题',
    gap.suggestedTopic || gap.title,
    '',
    '## 用户知识画像（节选）',
    profileMarkdown.slice(0, 3000),
    '',
    '## 搜索资料',
    searchText,
  ];

  // 重试时附加提示
  if (retryInfo && retryInfo.promptTweak) {
    userPrompt.push('', `## 特别要求（第 ${retryInfo.attempt + 1} 次重试）`, retryInfo.promptTweak);
  }

  const user = userPrompt.join('\n');

  const tasks = [];
  if (deepseekKey) {
    tasks.push(llmCall({
      hostname: 'api.deepseek.com',
      apiPath: '/v1/chat/completions',
      apiKey: deepseekKey,
      model: 'deepseek-chat',
      system,
      user,
      maxTokens: 4000,
    }).then((r) => ({ r, src: 'deepseek' })));
  }
  if (glmKey) {
    tasks.push(llmCall({
      hostname: 'open.bigmodel.cn',
      apiPath: '/api/paas/v4/chat/completions',
      apiKey: glmKey,
      model: 'glm-4-flash',
      system,
      user,
      maxTokens: 4000,
    }).then((r) => ({ r, src: 'glm' })));
  }

  try {
    const { r, src } = await Promise.any(tasks);
    console.log(`[auto_research] LLM 笔记生成成功 (${src})，${r.length} 字符`);
    return r;
  } catch (e) {
    console.error(`[auto_research] LLM 笔记生成失败：${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// LLM 自我评分
// ═══════════════════════════════════════════════════════════════

async function scoreNote({ note, gap }) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;

  if (!deepseekKey && !glmKey) {
    console.log('[auto_research] 无 API Key，跳过评分');
    return null;
  }

  const system = [
    '你是严格的学习笔记评审员。根据以下标准给笔记打分（0-100 分）：',
    '',
    '- **完整性**（30分）：是否覆盖了知识空白的核心内容？',
    '- **准确性**（25分）：数学推导/代码逻辑是否正确？',
    '- **可读性**（25分）：是否从用户已有知识出发？对用户来说是否易懂？',
    '- **实操性**（20分）：代码是否可以运行？是否有具体的动手环节？',
    '',
    '## 知识空白背景',
    `标题：${gap.title}`,
    `说明：${gap.why}`,
    `用户已有：${(gap.prerequisites_met || []).join('、')}`,
    `学习目标：${gap.suggestedTopic}`,
    '',
    '## 输出要求',
    '1. 给出总分（只给出数字，0-100）',
    '2. 简要说明每项得分和扣分原因',
    '3. 如果总分 < 70，给出改进建议',
    '',
    '输出格式：',
    '```',
    '总分: XX',
    '',
    '完整性: XX/30 — （原因）',
    '准确性: XX/25 — （原因）',
    '可读性: XX/25 — （原因）',
    '实操性: XX/20 — （原因）',
    '',
    '改进建议：（如果有）',
    '```',
  ].join('\n');

  const user = [
    '## 学习笔记',
    note.slice(0, 8000),
    '',
    '请评分。',
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
      maxTokens: 1000,
    }).then((r) => ({ r, src: 'deepseek' })));
  }
  if (glmKey) {
    tasks.push(llmCall({
      hostname: 'open.bigmodel.cn',
      apiPath: '/api/paas/v4/chat/completions',
      apiKey: glmKey,
      model: 'glm-4-flash',
      system,
      user,
      maxTokens: 1000,
    }).then((r) => ({ r, src: 'glm' })));
  }

  try {
    const { r, src } = await Promise.any(tasks);
    console.log(`[auto_research] 评分完成 (${src})`);

    // 解析总分
    const scoreMatch = r.match(/总分[:：]\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    if (score !== null) {
      console.log(`[auto_research] 得分：${score}/100`);
    } else {
      console.log('[auto_research] 无法从评分回复中解析出分数');
    }

    return { score, detail: r };
  } catch (e) {
    console.error(`[auto_research] 评分失败：${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 写入笔记到 Obsidian 仓库
// ═══════════════════════════════════════════════════════════════

function writeNote({ noteContent, gap, score, searchFallback }) {
  const bj = beijingNow();

  // 构建 frontmatter
  const title = gap.suggestedTopic || gap.title;
  const frontmatter = `---
created: ${bj.dateStr}
source: auto_research
gap_id: ${gap.id}
score: ${score || 'N/A'}
search_fallback: ${searchFallback ? 'true' : 'false'}
---

`;

  // 如果 LLM 返回的内容已经有 # 标题，就不重复加
  let body = noteContent || '';
  // 如果 body 以 # 开头，说明 LLM 自己产出了标题，直接使用
  // 否则在 frontmatter 后加标题和结构
  if (!body.trim().startsWith('#')) {
    body = [
      `# ${title}`,
      '',
      '## 从你已知的开始',
      `你已掌握：${(gap.prerequisites_met || []).join('、')}`,
      '',
      '## 核心推导',
      body,
      '',
      '## 代码验证',
      '// TODO',
      '',
      '## 与你的课程连接',
      `相关课程：${(gap.relatedCourses || []).join('、') || '待关联'}`,
    ].join('\n');
  }

  const fullContent = frontmatter + body;

  // 确保输出目录存在
  fs.mkdirSync(NOTE_OUT_DIR, { recursive: true });

  // 文件名：用标题生成安全文件名
  const safeFileName = title
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60) + '.md';
  const outPath = path.join(NOTE_OUT_DIR, safeFileName);

  fs.writeFileSync(outPath, fullContent, 'utf8');
  console.log(`[auto_research] 笔记已写入：${outPath}`);

  return outPath;
}

// ═══════════════════════════════════════════════════════════════
// Git commit + push（与 generate-daily.js 一致的风格）
// ═══════════════════════════════════════════════════════════════

function commitAndPush(filePath, gapId) {
  const pushToken = process.env.STUDY_PUSH_TOKEN;

  if (!pushToken) {
    console.log('[auto_research] 无 STUDY_PUSH_TOKEN，跳过 git 推送');
    return false;
  }

  if (!fs.existsSync(path.join(STUDY_DIR, '.git'))) {
    console.log('[auto_research] 学习目录不是 git 仓库，跳过推送');
    return false;
  }

  const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';

  try {
    const relPath = path.relative(STUDY_DIR, filePath).replace(/\\/g, '/');
    console.log(`[auto_research] git add: ${relPath}`);

    execSync(`git add "${relPath}"`, { cwd: STUDY_DIR, stdio: 'pipe', timeout: 10000 });

    // 检查是否有变更
    try {
      execSync('git diff --cached --quiet', { cwd: STUDY_DIR, stdio: 'pipe', timeout: 5000 });
      console.log('[auto_research] 无变更，跳过提交');
      return false;
    } catch {
      // diff 非零退出 = 有变更，继续
    }

    const commitMsg = `feat(auto_research): ${gapId} 自主研究笔记`;
    execSync(
      `git -c user.name="timetable-bot" -c user.email="timetable-bot@users.noreply.github.com" ` +
      `commit -m "${commitMsg}"`,
      { cwd: STUDY_DIR, stdio: 'pipe', timeout: 10000 }
    );
    console.log(`[auto_research] git commit: ${commitMsg}`);

    const authed = repo.replace('https://', `https://x-access-token:${pushToken}@`);
    execSync(`git push "${authed}" HEAD:main`, { cwd: STUDY_DIR, stdio: 'pipe', timeout: 30000 });
    console.log('[auto_research] git push 成功');

    return true;
  } catch (e) {
    const msg = (e.stdout || '') + (e.stderr || '');
    if (msg.includes('nothing to commit')) {
      console.log('[auto_research] 无变更，跳过推送');
      return false;
    }
    console.error(`[auto_research] git 操作失败：${e.message}`);
    console.error(`[auto_research] 详情：${msg.slice(0, 500)}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 更新 learning_gaps.json
// ═══════════════════════════════════════════════════════════════

function updateGapsFile(gapId, newStatus) {
  if (!fs.existsSync(GAPS_PATH)) {
    console.log(`[auto_research] gaps 文件不存在：${GAPS_PATH}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8'));
  const gaps = data.gaps || [];

  let found = false;
  for (const g of gaps) {
    if (g.id === gapId) {
      g.status = newStatus;
      g.resolvedAt = newStatus === 'resolved' ? new Date().toISOString() : undefined;
      g.failedAt = newStatus === 'failed' ? new Date().toISOString() : undefined;
      found = true;
      break;
    }
  }

  if (found) {
    data.gaps = gaps;
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(GAPS_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[auto_research] 已更新 gaps 状态：${gapId} → ${newStatus}`);
  } else {
    console.log(`[auto_research] 未找到 ${gapId}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════

async function main() {
  const bj = beijingNow();
  console.log('[auto_research] 自主研究 Agent 启动');
  console.log(`[auto_research] 北京时间：${bj.dateStr}`);
  console.log(`[auto_research] 学习目录：${STUDY_DIR}`);

  // ── Step 0: 检查 API Key ──
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;

  if (!deepseekKey && !glmKey) {
    console.log('[auto_research] 无 API Key（DEEPSEEK_API_KEY / GLM_API_KEY），跳过 LLM 调用，退出');
    return;
  }

  // ── Step 1: 选择目标 gap ──
  console.log('[auto_research] ── Step 1: 选择目标知识空白 ──');

  if (!fs.existsSync(GAPS_PATH)) {
    console.log(`[auto_research] gaps 文件不存在：${GAPS_PATH}，退出`);
    return;
  }

  const gapsData = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8'));
  const allGaps = gapsData.gaps || [];

  if (allGaps.length === 0) {
    console.log('[auto_research] 无知识空白，退出');
    return;
  }

  // 按优先级排序，找第一个 open 的
  const openGaps = allGaps
    .filter(g => g.status === 'open')
    .sort((a, b) => (a.priority || 3) - (b.priority || 3));

  if (openGaps.length === 0) {
    console.log('[auto_research] 所有知识空白已处理完毕，无 open 状态 gap，退出');
    return;
  }

  // 支持通过环境变量指定特定 gap
  const targetGapId = process.env.GAP_ID;
  let gap;
  if (targetGapId) {
    gap = openGaps.find(g => g.id === targetGapId);
    if (!gap) {
      console.log(`[auto_research] 指定的 gap ${targetGapId} 不是 open 状态或不存在，使用优先级最高的`);
      gap = openGaps[0];
    }
  } else {
    gap = openGaps[0];
  }

  console.log(`[auto_research] 选中：${gap.id} "${gap.title}" (priority=${gap.priority})`);

  // ── Step 2: 读取知识画像 ──
  let profileMarkdown = '';
  if (fs.existsSync(PROFILE_PATH)) {
    profileMarkdown = fs.readFileSync(PROFILE_PATH, 'utf8');
    console.log(`[auto_research] 知识画像已加载 (${profileMarkdown.length} 字符)`);
  } else {
    console.log('[auto_research] 未找到知识画像文件，将使用空白画像');
  }

  // ── Step 3: 搜索 + LLM 生成 + 评分（支持重试） ──
  console.log('[auto_research] ── Step 2-4: 搜索 → 生成 → 评分循环 ──');

  let bestNote = null;
  let bestScore = null;
  let bestSearchFallback = false;
  let finalStatus = 'failed';

  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    const strategy = RETRY_STRATEGIES[attempt] || RETRY_STRATEGIES[RETRY_STRATEGIES.length - 1];
    console.log(`[auto_research] 第 ${attempt + 1}/${CONFIG.MAX_RETRIES} 次尝试...`);

    // ── 搜索 ──
    const queries = buildSearchQueries(gap, strategy.searchVariant);
    let allResults = [];
    let searchFailed = true;

    for (const q of queries) {
      const results = await googleSearch(q);
      if (results.length > 0) {
        allResults = allResults.concat(results);
        searchFailed = false;
      }
    }

    // 去重搜索结果
    const seenLinks = new Set();
    allResults = allResults.filter(r => {
      if (seenLinks.has(r.link)) return false;
      seenLinks.add(r.link);
      return true;
    }).slice(0, CONFIG.MAX_SEARCH_RESULTS);

    let searchFallback = false;
    if (allResults.length === 0) {
      console.log('[auto_research] Google 搜索失败，降级为 LLM 知识模式');
      searchFallback = true;
    } else {
      console.log(`[auto_research] 合计 ${allResults.length} 条搜索摘要`);
    }

    // ── 生成笔记 ──
    const retryInfo = attempt > 0 ? { attempt, promptTweak: strategy.promptTweak } : null;
    const note = await generateNote({
      gap,
      profileMarkdown,
      searchResults: allResults,
      searchFallback,
      retryInfo,
    });

    if (!note) {
      console.log('[auto_research] 笔记生成失败，继续重试...');
      continue;
    }

    // ── 评分 ──
    const scoreResult = await scoreNote({ note, gap });
    const score = scoreResult ? scoreResult.score : null;

    if (score !== null) {
      if (bestScore === null || score > bestScore) {
        bestScore = score;
        bestNote = note;
        bestSearchFallback = searchFallback;
      }

      if (score >= CONFIG.SCORE_THRESHOLD) {
        console.log(`[auto_research] 得分 ${score} >= ${CONFIG.SCORE_THRESHOLD}，通过！`);
        finalStatus = 'resolved';
        break;
      } else {
        console.log(`[auto_research] 得分 ${score} < ${CONFIG.SCORE_THRESHOLD}，不达标`);
      }
    } else {
      // 评分失败，直接用当前笔记（保底）
      if (bestNote === null) {
        bestNote = note;
        bestSearchFallback = searchFallback;
      }
    }

    // 如果还没到最后一次，继续重试
    if (attempt < CONFIG.MAX_RETRIES - 1) {
      console.log(`[auto_research] 准备重试 (${CONFIG.MAX_RETRIES - attempt - 1} 次机会)...`);
    }
  }

  // ── Step 5: 决定最终状态 ──
  // 如果 bestScore 存在且 >= threshold，状态已在循环中设置
  // 如果循环结束 bestScore < threshold 或 bestNote 为空，设为 failed
  if (finalStatus !== 'resolved' && bestScore !== null && bestScore >= CONFIG.SCORE_THRESHOLD) {
    finalStatus = 'resolved';
  }

  console.log(`[auto_research] ── 决策：最终状态 = ${finalStatus}，最高分 = ${bestScore}`);

  // ── Step 6: 写笔记 + git push + 更新 gaps ──
  if (bestNote) {
    const notePath = writeNote({
      noteContent: bestNote,
      gap,
      score: bestScore,
      searchFallback: bestSearchFallback,
    });

    if (finalStatus === 'resolved') {
      commitAndPush(notePath, gap.id);
    } else {
      console.log('[auto_research] 笔记未达阈值，仅本地保存，不推送');
    }
  } else {
    console.log('[auto_research] 所有尝试均失败，无笔记产出');
  }

  // ── Step 7: 更新 gaps 状态 ──
  updateGapsFile(gap.id, finalStatus);

  // ── 输出摘要 ──
  console.log('[auto_research] ═══════════════════════════════════════');
  console.log(`[auto_research] 完成：${gap.id} → ${finalStatus}`);
  console.log(`[auto_research] 最高分：${bestScore !== null ? bestScore : 'N/A'}`);
  console.log(`[auto_research] 状态：${finalStatus === 'resolved' ? '已解决 ✓' : '未达标 ✗'}`);
  console.log('[auto_research] ═══════════════════════════════════════');
}

main().catch((e) => {
  console.error('[auto_research] 错误：', e?.stack || String(e));

  // 即使崩溃也尝试写一个空输出，避免下游流程中断
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const fallbackPath = path.join(OUT_DIR, 'auto_research_error.json');
    fs.writeFileSync(fallbackPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      error: String(e),
      _note: '自主研究 Agent 崩溃，此文件用于调试',
    }, null, 2), 'utf8');
    console.log(`[auto_research] 已写入错误恢复文件：${fallbackPath}`);
  } catch { /* 最后的兜底 */ }

  process.exit(1);
});
