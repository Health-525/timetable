#!/usr/bin/env node
/**
 * 将 Markdown 文件转换为 PDF（支持中文、图片、代码高亮）
 *
 * Usage:
 *   node scripts/md-to-pdf.js --input <md文件或目录> --out <输出目录> [--base <图片基础路径>]
 *
 * 依赖：
 *   npm install md-to-pdf
 *
 * 特性：
 *   - 自动处理相对路径图片（base 目录）
 *   - 中文字体：Noto Sans CJK（GitHub Actions Ubuntu 自带）
 *   - 代码高亮（github 主题）
 *   - 支持单文件或批量目录转换
 */

const fs = require('fs');
const path = require('path');
const { mdToPdf } = require('md-to-pdf');

// ── 参数解析 ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { input: null, outDir: null, base: null, files: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input'  && argv[i + 1]) out.input  = argv[++i];
    if (argv[i] === '--out'    && argv[i + 1]) out.outDir = argv[++i];
    if (argv[i] === '--base'   && argv[i + 1]) out.base   = argv[++i];
    if (argv[i] === '--files'  && argv[i + 1]) out.files  = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

// ── 收集 MD 文件 ──────────────────────────────────────────────────────────────
function collectMdFiles(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    return inputPath.endsWith('.md') ? [inputPath] : [];
  }
  const results = [];
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    const full = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      // 跳过隐藏目录
      if (!entry.name.startsWith('.')) results.push(...collectMdFiles(full));
    } else if (entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// ── PDF 样式 ──────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600&display=swap');

* { box-sizing: border-box; }

body {
  font-family: 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-size: 14px;
  line-height: 1.8;
  color: #1a1a1a;
  max-width: 780px;
  margin: 0 auto;
  padding: 20px 30px;
}

h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 6px; margin-top: 0; }
h2 { font-size: 20px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 28px; }
h3 { font-size: 17px; margin-top: 20px; }
h4, h5, h6 { margin-top: 16px; }

p { margin: 10px 0; }

a { color: #0366d6; text-decoration: none; }

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 12px auto;
  border-radius: 4px;
}

code {
  font-family: 'Fira Code', 'Consolas', monospace;
  background: #f3f4f6;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 13px;
}

pre {
  background: #f6f8fa;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 14px 16px;
  overflow-x: auto;
  line-height: 1.5;
}

pre code {
  background: none;
  padding: 0;
  font-size: 13px;
}

blockquote {
  border-left: 4px solid #0366d6;
  background: #f1f8ff;
  margin: 12px 0;
  padding: 8px 14px;
  border-radius: 0 4px 4px 0;
  color: #444;
}

/* Obsidian callout → blockquote 兼容 */
blockquote p:first-child strong { color: #0366d6; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 14px 0;
  font-size: 13px;
}
th, td {
  border: 1px solid #dfe2e5;
  padding: 7px 12px;
  text-align: left;
}
th { background: #f6f8fa; font-weight: 600; }
tr:nth-child(even) { background: #fafbfc; }

hr { border: none; border-top: 1px solid #e1e4e8; margin: 24px 0; }

ul, ol { padding-left: 24px; }
li { margin: 4px 0; }

/* 任务列表 */
input[type=checkbox] { margin-right: 6px; }

@page {
  margin: 20mm 18mm;
}

@media print {
  pre { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
}
`;

// ── 转换单个文件 ──────────────────────────────────────────────────────────────
async function convertFile(mdPath, outDir, baseDir) {
  const fileName = path.basename(mdPath, '.md') + '.pdf';
  // 保持相对目录结构
  const relDir  = baseDir ? path.relative(baseDir, path.dirname(mdPath)) : '';
  const destDir = relDir ? path.join(outDir, relDir) : outDir;
  fs.mkdirSync(destDir, { recursive: true });

  const destPath = path.join(destDir, fileName);
  const mdDir    = path.dirname(mdPath);

  try {
    await mdToPdf(
      { path: mdPath },
      {
        dest: destPath,
        css: CSS,
        // 让 Chrome 能访问本地图片
        launch_options: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            `--allow-file-access-from-files`,
          ],
        },
        // 将 MD 文件所在目录作为资源根目录，图片相对路径能正确解析
        basedir: mdDir,
        md_file_encoding: 'utf-8',
        pdf_options: {
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
        },
      }
    );
    console.log(`[ok]  ${path.relative(process.cwd(), mdPath)}  →  ${path.relative(process.cwd(), destPath)}`);
    return { success: true, dest: destPath };
  } catch (err) {
    console.error(`[err] ${path.relative(process.cwd(), mdPath)}: ${err.message}`);
    return { success: false };
  }
}

// ── 主函数 ────────────────────────────────────────────────────────────────────
async function main() {
  const { input, outDir, base, files } = parseArgs(process.argv);

  if ((!input && files.length === 0) || !outDir) {
    console.error('Usage: node md-to-pdf.js --input <md路径> --out <输出目录> [--base <基础路径>]');
    console.error('   or: node md-to-pdf.js --files <f1.md,f2.md> --out <输出目录> [--base <基础路径>]');
    process.exit(2);
  }

  // 收集所有待转换文件
  let mdFiles = [];
  if (files.length > 0) {
    mdFiles = files.filter(f => {
      if (!fs.existsSync(f)) { console.warn(`[skip] 文件不存在: ${f}`); return false; }
      return f.endsWith('.md');
    });
  } else {
    if (!fs.existsSync(input)) {
      console.error(`路径不存在: ${input}`);
      process.exit(2);
    }
    mdFiles = collectMdFiles(input);
  }

  if (mdFiles.length === 0) {
    console.log('[info] 没有找到 .md 文件');
    process.exit(0);
  }

  console.log(`共 ${mdFiles.length} 个文件待转换，输出目录: ${outDir}`);

  const baseDir = base || (input && fs.statSync(input).isDirectory() ? input : null);

  let ok = 0, fail = 0;
  for (const f of mdFiles) {
    const result = await convertFile(f, outDir, baseDir);
    result.success ? ok++ : fail++;
  }

  console.log(`\n完成: ${ok} 成功 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('未捕获错误:', err);
  process.exit(1);
});
