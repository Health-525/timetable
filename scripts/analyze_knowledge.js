#!/usr/bin/env node

/**
 * 知识画像分析 Agent · Knowledge Gap Analyzer
 *
 * 每周一、周四自动运行（北京时间 21:00），读取用户知识画像和课程笔记，
 * 通过 DeepSeek LLM 分析知识空白，输出结构化 gaps 列表。
 *
 * 输入（环境变量）：
 *   STUDY_DIR         — jiangshu-study 仓库本地路径
 *   DEEPSEEK_API_KEY  — DeepSeek API Key（主）
 *   GLM_API_KEY       — GLM API Key（备用）
 *
 * 输出路径：_out/learning_gaps.json
 */

const fs = require('fs');
const path = require('path');
const comm = require('./lib/agent-comm');

// ═══════════════════════════════════════════════════════════════
// 路径与配置
// ═══════════════════════════════════════════════════════════════

const STUDY_DIR = process.env.STUDY_DIR || path.join(process.cwd(), '_study');
const OUT_DIR = path.join(process.cwd(), '_out');
const PROFILE_PATH = path.join(STUDY_DIR, '_meta', '知识画像.md');
const INSPIRATION_PATH = path.join(STUDY_DIR, '10-灵感感悟', '灵感.md');
const COURSE_MAP = {
  '00-Inbox':              { label: '收件箱 / 未归类',        exclude: true },
  '01-大数据技术基础':       { label: '大数据技术基础',          courseNum: '01' },
  '02-Python数据处理与分析': { label: 'Python数据处理与分析',   courseNum: '02' },
  '03-数据结构与算法':       { label: '数据结构与算法',          courseNum: '03' },
  '04-多元统计分析':         { label: '多元统计分析',            courseNum: '04' },
  '05-数值分析':             { label: '数值分析',                courseNum: '05' },
  '06-数学模型与数学软件':   { label: '数学模型与数学软件',     courseNum: '06' },
  '07-英语':                 { label: '英语',                    courseNum: '07' },
  '08-AI学习':               { label: 'AI学习',                  courseNum: '08' },
  '09-日常处理':             { label: '日常处理',                exclude: true },
};

// ═══════════════════════════════════════════════════════════════
// 知识画像解析
// ═══════════════════════════════════════════════════════════════

function parseProfile(md) {
  const strengths = [];
  const weaknesses = [];

  // 提取优势区
  const strengthSection = md.match(/### 优势区[\s\S]*?(?=###|$)/);
  if (strengthSection) {
    const items = strengthSection[0].match(/- ✅\s*(.+)/g);
    if (items) {
      for (const item of items) {
        const text = item.replace(/- ✅\s*/, '').trim();
        if (text) strengths.push(text);
      }
    }
  }

  // 提取薄弱区
  const weaknessSection = md.match(/### 薄弱区[\s\S]*?(?=###|$)/);
  if (weaknessSection) {
    const items = weaknessSection[0].match(/- ❌\s*(.+)/g);
    if (items) {
      for (const item of items) {
        const text = item.replace(/- ❌\s*/, '').trim();
        if (text) weaknesses.push(text);
      }
    }
  }

  // 如果没有匹配到优势/弱项，从"知识水平诊断"大段中提取
  if (strengths.length === 0) {
    const altSection = md.match(/优势区[\s\S]*?(?=薄弱区|###|$)/);
    if (altSection) {
      const items = altSection[0].match(/- ✅\s*(.+)/g);
      if (items) {
        for (const item of items) {
          strengths.push(item.replace(/- ✅\s*/, '').trim());
        }
      }
    }
  }

  if (weaknesses.length === 0) {
    const altSection = md.match(/薄弱区[\s\S]*?(?=关键知识空白|###|$)/);
    if (altSection) {
      const items = altSection[0].match(/- ❌\s*(.+)/g);
      if (items) {
        for (const item of items) {
          weaknesses.push(item.replace(/- ❌\s*/, '').trim());
        }
      }
    }
  }

  // 提取关键知识空白
  let knownGaps = '';
  const gapSection = md.match(/### 关键知识空白[\s\S]*?(?=---|## |$)/);
  if (gapSection) {
    knownGaps = gapSection[0].trim();
  }

  return { strengths, weaknesses, knownGaps };
}

// ═══════════════════════════════════════════════════════════════
// 课程目录扫描
// ═══════════════════════════════════════════════════════════════

function scanCourseDirs() {
  const stats = [];

  if (!fs.existsSync(STUDY_DIR)) {
    console.log(`[analyze] 学习目录不存在：${STUDY_DIR}`);
    return stats;
  }

  const entries = fs.readdirSync(STUDY_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirName = entry.name;
    const cfg = COURSE_MAP[dirName];
    if (!cfg || cfg.exclude) continue;

    const dirPath = path.join(STUDY_DIR, dirName);

    // 递归统计 markdown 文件数
    let mdCount = 0;
    let totalFiles = 0;
    try {
      const walk = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            walk(full);
          } else if (item.isFile()) {
            totalFiles++;
            if (item.name.endsWith('.md')) mdCount++;
          }
        }
      };
      walk(dirPath);
    } catch (e) {
      console.log(`[analyze] 扫描 ${dirName} 时出错：${e.message}`);
    }

    stats.push({
      dirName,
      label: cfg.label,
      courseNum: cfg.courseNum,
      mdCount,
      totalFiles,
    });
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════
// LLM 调用工具
// ═══════════════════════════════════════════════════════════════

function llmCall({ hostname, apiPath, apiKey, model, system, user, maxTokens, responseFormat }) {
  const https = require('https');
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    max_tokens: maxTokens || 4000,
  };
  if (responseFormat) {
    body.response_format = { type: responseFormat };
  }
  const payload = JSON.stringify(body);

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
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// LLM 空白分析
// ═══════════════════════════════════════════════════════════════

async function analyzeGapsViaLLM({ profileMarkdown, courseStats, inspirationContent }) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const glmKey = process.env.GLM_API_KEY;

  if (!deepseekKey && !glmKey) {
    console.log('[analyze] 无 API Key，跳过 LLM 分析');
    return null;
  }

  const system = [
    '你是学习路径分析师。根据用户的知识画像和课程笔记现状，找出应该学但还没学、或者学了但理解不深的知识点。',
    '',
    '分析要点：',
    '1. 桥接空白：两个已学概念之间的中间连接缺失（如：学了特征值分解和PCA调用，但没学协方差矩阵如何桥接两者）',
    '2. 深度不足：某知识点仅停留在调用/应用层，缺少原理推导',
    '3. 缺失模块：某个方向应有但完全没有笔记覆盖的模块',
    '4. 兴趣缺口：用户明确感兴趣但尚未开始学习的方向',
    '',
    '输出要求：',
    '- 必须输出严格的 JSON，不要有任何额外的文字',
    '- 输出格式：{ "gaps": [...] }',
    '- 每个 gap 对象包含以下字段：',
    '  - id: "gap-XXX" 格式（XXX为三位数字，从001开始）',
    '  - title: 一句话概括这个知识空白',
    '  - category: 类别（如"数学桥接"、"AI/ML"、"工程深化"、"理论基础"、"项目实战"）',
    '  - priority: 1-3（1最高优先级，3较低）',
    '  - why: 为什么这是个空白，当前掌握情况和缺失点',
    '  - prerequisites_met: 字符串数组，列出已具备的前置知识',
    '  - suggestedTopic: 建议学习的主题名称',
    '  - relatedCourses: 字符串数组，相关课程编号如 ["04-多元统计分析", "05-数值分析"]',
    '  - status: "open"',
    '- 至少输出 3 个 gaps，最多 10 个',
    '- 仔细分析用户的知识画像，结合课程笔记数量，给出有针对性的、具体的空白点',
  ].join('\n');

  const courseLines = courseStats.map((c) =>
    `- ${c.courseNum}-${c.label}：${c.mdCount} 篇 Markdown 笔记 / ${c.totalFiles} 个文件`
  );

  const user = [
    '## 用户知识画像',
    profileMarkdown.slice(0, 4000),
    '',
    '## 课程笔记统计',
    ...courseLines,
    '',
    `总笔记文件数：${courseStats.reduce((s, c) => s + c.mdCount, 0)} 篇`,
    `总文件数：${courseStats.reduce((s, c) => s + c.totalFiles, 0)} 个`,
    '',
    '## 用户灵感与兴趣',
    inspirationContent.slice(0, 1500) || '（无记录）',
    '',
    '请分析知识空白，输出 JSON。',
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
      maxTokens: 4000,
      responseFormat: 'json_object',
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
    console.log(`[analyze] LLM 分析成功 (${src})`);
    return r;
  } catch (e) {
    console.error(`[analyze] LLM 分析失败：${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// JSON 解析工具（从 LLM 返回文本中提取严格 JSON）
// ═══════════════════════════════════════════════════════════════

function extractJSON(text) {
  if (!text) return null;

  // 尝试直接解析
  try {
    const obj = JSON.parse(text);
    if (obj && obj.gaps) return obj;
  } catch { /* 继续 */ }

  // 尝试从 markdown code fences 中提取
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const obj = JSON.parse(fenceMatch[1].trim());
      if (obj && obj.gaps) return obj;
    } catch { /* 继续 */ }
  }

  // 尝试找到 JSON 对象的起止
  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    const slice = text.slice(startIdx, endIdx + 1);
    try {
      const obj = JSON.parse(slice);
      if (obj && obj.gaps) return obj;
    } catch { /* 继续 */ }
  }

  // 最后兜底：尝试修复常见 JSON 问题后重新解析
  if (startIdx !== -1 && endIdx > startIdx) {
    try {
      let slice = text.slice(startIdx, endIdx + 1);
      // 移除尾随逗号（在 ] 或 } 之前）
      slice = slice.replace(/,(\s*[}\]])/g, '$1');
      // 替换中文引号
      slice = slice.replace(/“/g, '"').replace(/”/g, '"');
      slice = slice.replace(/‘/g, "'").replace(/’/g, "'");
      const obj = JSON.parse(slice);
      if (obj && obj.gaps) return obj;
    } catch { /* 尽力了 */ }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// 生成 Dry-Run 示例输出
// ═══════════════════════════════════════════════════════════════

function generateDryRunOutput(profile, courseStats, reason) {
  const allCourses = courseStats.map((c) => `${c.courseNum}-${c.label}`);
  const weakCourse = courseStats
    .filter((c) => c.mdCount <= 5)
    .map((c) => `${c.courseNum}-${c.label}`);
  const strongCourse = courseStats
    .filter((c) => c.mdCount >= 10)
    .map((c) => `${c.courseNum}-${c.label}`);

  const noteMap = {
    no_llm: '此文件为 dry-run 模式生成，未调用 LLM。请检查 DEEPSEEK_API_KEY / GLM_API_KEY 是否已配置。',
    json_parse_failed: '此文件为 dry-run 模式生成。LLM 已调用但返回内容无法解析为有效 JSON，请检查 GitHub Actions 日志中的 LLM 原始输出。',
  };
  const note = noteMap[reason] || noteMap.no_llm;

  return {
    generatedAt: new Date().toISOString(),
    _note: note,
    profile: {
      strengths: profile.strengths.length > 0
        ? profile.strengths
        : ['多元统计分析（PCA/LDA/CCA数学推导）', 'Python数据处理（pandas/numpy）', '技术英语写作'],
      weaknesses: profile.weaknesses.length > 0
        ? profile.weaknesses
        : ['AI/ML理论体系', '深度学习框架实践', 'Rust语言'],
    },
    gaps: [
      {
        id: 'gap-001',
        title: 'PCA 从特征值分解到主成分的完整推导',
        category: '数学桥接',
        priority: 1,
        why: '你在多元统计里用了PCA，在数值分析里学了特征值分解，但缺少协方差矩阵→特征值分解→主成分→降维的中间桥接',
        prerequisites_met: ['特征值分解', '协方差矩阵'],
        suggestedTopic: '协方差矩阵特征值分解与PCA降维的数学推导',
        relatedCourses: strongCourse.slice(0, 2),
        status: 'open',
      },
      {
        id: 'gap-002',
        title: '从零实现神经网络训练循环',
        category: 'AI/ML',
        priority: 1,
        why: 'fork了LLMs-from-scratch但没学完，08-AI学习目录笔记极少，缺少从numpy手写到框架的认知阶梯',
        prerequisites_met: ['numpy', '梯度下降概念'],
        suggestedTopic: '纯numpy实现前馈神经网络 + 反向传播训练循环',
        relatedCourses: ['02-Python数据处理与分析', '08-AI学习'],
        status: 'open',
      },
      {
        id: 'gap-003',
        title: 'Git 内部对象模型（blob/tree/commit/tag）',
        category: '工程深化',
        priority: 2,
        why: '日常使用git add/commit/push和GitHub Actions，但未理解Git底层存储模型，影响复杂操作的理解',
        prerequisites_met: ['Git 日常使用', '哈希概念'],
        suggestedTopic: 'Git Objects：blob、tree、commit、tag 的内部结构与存储',
        relatedCourses: weakCourse.slice(0, 1),
        status: 'open',
      },
      {
        id: 'gap-004',
        title: 'MCP 协议规范深入理解',
        category: '工程深化',
        priority: 2,
        why: '有MCP服务器实践项目(d:\\mcp1)，但缺少对MCP协议规范的体系化学习，影响自建高质量Agent',
        prerequisites_met: ['JSON-RPC基础', 'Node.js/TypeScript', 'Claude API使用'],
        suggestedTopic: 'MCP协议规范：工具定义、资源管理、提示模板的完整实现',
        relatedCourses: ['08-AI学习'],
        status: 'open',
      },
      {
        id: 'gap-005',
        title: '深度学习注意力机制与GAT的完整理解',
        category: 'AI/ML',
        priority: 2,
        why: '有图注意力网络（GAT）的Jupyter笔记，但08-AI学习基础薄弱，可能只跟了代码没有理解原理',
        prerequisites_met: ['矩阵运算', '图论基础', 'softmax'],
        suggestedTopic: '从self-attention到GAT的逐步推导与实践',
        relatedCourses: allCourses.slice(0, 2),
        status: 'open',
      },
      {
        id: 'gap-006',
        title: 'Rust语言基础入门',
        category: '理论基础',
        priority: 3,
        why: '已安装Rust环境但尚未开始学习，在系统编程/高性能方向有成长潜力',
        prerequisites_met: ['C/C++基础', '内存管理概念'],
        suggestedTopic: 'Rust所有权模型、借用检查器、生命周期的基础认知',
        relatedCourses: [],
        status: 'open',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════

async function main() {
  const ctx = comm.preflight('knowledge-analyzer', { timetableDir: process.cwd() });
  console.log('[analyze] 知识画像分析 Agent 启动');
  console.log(`[analyze] 学习目录：${STUDY_DIR}`);

  // ── 1. 读取知识画像 ──
  let profileMarkdown = '';
  let profile = { strengths: [], weaknesses: [], knownGaps: '' };
  if (fs.existsSync(PROFILE_PATH)) {
    profileMarkdown = fs.readFileSync(PROFILE_PATH, 'utf8');
    profile = parseProfile(profileMarkdown);
    console.log(`[analyze] 知识画像已加载（优势${profile.strengths.length}项 / 弱项${profile.weaknesses.length}项）`);
  } else {
    console.log('[analyze] 未找到知识画像文件，将使用空画像');
  }

  // ── 2. 扫描课程目录 ──
  console.log('[analyze] 扫描课程目录...');
  const courseStats = scanCourseDirs();
  console.log(`[analyze] 扫描完成：${courseStats.length} 个课程目录`);
  for (const c of courseStats) {
    console.log(`  ${c.courseNum}-${c.label}: ${c.mdCount} 篇笔记 / ${c.totalFiles} 个文件`);
  }

  // ── 3. 读取灵感笔记 ──
  let inspirationContent = '';
  if (fs.existsSync(INSPIRATION_PATH)) {
    inspirationContent = fs.readFileSync(INSPIRATION_PATH, 'utf8');
    console.log('[analyze] 灵感笔记已加载');
  } else {
    console.log('[analyze] 未找到灵感笔记');
  }

  // ── 4. LLM 分析 ──
  console.log('[analyze] 调用 LLM 分析知识空白...');
  const llmResult = await analyzeGapsViaLLM({ profileMarkdown, courseStats, inspirationContent });

  // ── 5. 构建输出 ──
  let output;

  if (llmResult) {
    // 尝试解析 LLM 返回的 JSON
    const parsed = extractJSON(llmResult);
    if (parsed && parsed.gaps && parsed.gaps.length > 0) {
      output = {
        generatedAt: new Date().toISOString(),
        profile: {
          strengths: profile.strengths,
          weaknesses: profile.weaknesses,
        },
        gaps: parsed.gaps.map((g, i) => ({
          id: g.id || `gap-${String(i + 1).padStart(3, '0')}`,
          title: g.title || '',
          category: g.category || '未分类',
          priority: g.priority || 3,
          why: g.why || '',
          prerequisites_met: Array.isArray(g.prerequisites_met) ? g.prerequisites_met : [],
          suggestedTopic: g.suggestedTopic || g.title || '',
          relatedCourses: Array.isArray(g.relatedCourses) ? g.relatedCourses : [],
          status: g.status || 'open',
        })),
      };
      console.log(`[analyze] LLM 返回了 ${output.gaps.length} 个知识空白`);
    } else {
      console.log('[analyze] LLM 返回无法解析为有效 JSON，使用 dry-run 模式');
      console.log(`[analyze] LLM 原始输出（前500字符）：${llmResult.slice(0, 500)}`);
      output = generateDryRunOutput(profile, courseStats, 'json_parse_failed');
    }
  } else {
    // 无 API key 或 LLM 失败 → dry-run
    console.log('[analyze] 使用 dry-run 模式生成示例输出');
    output = generateDryRunOutput(profile, courseStats, 'no_llm');
  }

  // ── 6. 写入文件 ──
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'learning_gaps.json');
  comm.writeJsonAtomic(outPath, output);
  console.log(`[analyze] 输出已写入：${outPath}`);
  console.log(`[analyze] 共 ${output.gaps.length} 个知识空白`);
  console.log('[analyze] 完成');

  comm.postflight('knowledge-analyzer', {
    success: true,
    summary: { gapCount: output.gaps.length, source: output._note ? 'dry-run' : 'llm' },
  }, { timetableDir: process.cwd() });
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[analyze] 错误：', e?.stack || String(e));
    comm.postflight('knowledge-analyzer', {
      success: false,
      errors: [String(e)],
    }, { timetableDir: process.cwd() });

    // 即使崩溃也尝试写一个空输出，避免下游流程中断
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const fallbackPath = path.join(OUT_DIR, 'learning_gaps.json');
      comm.writeJsonAtomic(fallbackPath, {
        generatedAt: new Date().toISOString(),
        profile: { strengths: [], weaknesses: [] },
        gaps: [],
        error: String(e),
      });
      console.log(`[analyze] 已写入空输出（错误恢复）：${fallbackPath}`);
    } catch { /* 最后的兜底 */ }

    process.exit(1);
  });
}

module.exports = {
  parseProfile,
  extractJSON,
  generateDryRunOutput,
  main,
};
