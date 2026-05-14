# timetable

> `jiangshu-study` 的执行层仓库。这里存放自动化脚本、结构化数据、GitHub Actions 工作流，以及一个课表前端/PWA 原型。

## 仓库定位

`timetable` 负责“处理、计算、生成、回写”，不承担长期内容沉淀。

- 输入：`jiangshu-study` 中的 Markdown、`data/*.json`、环境变量
- 处理：Node.js / Python 脚本、GitHub Actions、LLM 调用
- 输出：结构化 JSON、回写到 `jiangshu-study` 的 Markdown 产物、前端课表展示

## 当前能力总览

基于当前代码，仓库已经包含这些能力：

- 课表生成：`scripts/generate-timetable.js`
- 订阅日历导出：`scripts/export_ics.js`
- 作业解析：`scripts/parse_assignments.js`
- 调课解析：`scripts/parse_adjustments.js`
- 跑步解析：`scripts/parse_running.js`
- 日报生成：`scripts/generate-daily.js`
- 周报生成：`scripts/generate-weekly.js`
- 知识空白分析：`scripts/analyze_knowledge.js`
- 自主研究闭环：`scripts/auto_research.js`
- 视频笔记提取与同步：
  - `scripts/fetch_video_note.js`
  - `scripts/youtube_daily_to_study.js`
  - `scripts/wechat_daily_to_jiangshu_study.js`
- PDF 课表提取：`scripts/extract_from_pdf.py`
- Web / PWA 课表端：`web/`

## 目录结构

```text
timetable/
├─ .github/workflows/        自动化工作流
├─ data/                     结构化数据源
├─ generated/                本地生成产物（已忽略）
├─ scripts/                  核心脚本与测试
├─ web/                      Next.js + Capacitor 前端
├─ obsidian-templates/       配套模板
├─ youtube/                  视频源配置
├─ wechat/                   公众号源配置
├─ _state/                   Agent 运行状态与消息
└─ requirements.txt          Python 依赖
```

### 工作流

当前仓库里存在以下 GitHub Actions：

- `生成课表.yml`
- `处理作业.yml`
- `处理调课.yml`
- `处理阳光长跑.yml`
- `生成日报.yml`
- `生成周报.yml`
- `知识分析-自主研究.yml`
- `同步YouTube笔记.yml`
- `提取视频笔记.yml`

其中 `生成课表.yml` 现在不仅会回写 `09-日常处理/课表.md`，还会：

- 生成 `09-日常处理/课表.ics`
- 同步公开订阅文件到 `jiangshu-study/public/schedule.ics`
- 配合 `jiangshu-study` 的 GitHub Pages 工作流，发布可订阅日历链接

## 数据文件

`data/` 目录是执行层的核心状态：

- `schedule.json`：课表主数据源
- `adjustments.json`：调课记录
- `assignments.json`：作业记录
- `running.json`：跑步记录

这些文件由脚本读写，尽量不要手工大范围改动。

## 本地运行

### 环境要求

- Node.js 20+ 更稳妥
- Python 3.8+（用于 PDF 提取等 Python 脚本）

### 常用命令

仓库根目录没有单独的 `package.json`，脚本直接通过 Node 运行：

```bash
cd timetable

node scripts/generate-timetable.js
# 默认输出到 generated/课表.md
node scripts/export_ics.js data/schedule.json output.ics
node scripts/parse_assignments.js
node scripts/parse_adjustments.js
node scripts/parse_running.js
node scripts/generate-daily.js
node scripts/generate-weekly.js
node scripts/analyze_knowledge.js
node scripts/auto_research.js
```

PDF 提取脚本示例：

```bash
python scripts/extract_from_pdf.py
```

### 运行测试

当前 `scripts/` 下已经有多组测试文件，可直接使用 Node 内置测试运行器：

```bash
node --test "scripts/*.test.js"
```

## Web 端

`web/` 是一个独立的 Next.js 项目，当前用于课表展示与移动端封装。

```bash
cd web
npm install
npm run dev
```

常用脚本：

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run cap:copy`
- `npm run cap:sync`

## 课表订阅链路

`timetable` 本地运行时，课表 Markdown 默认写入 `generated/课表.md`，只作为执行层本地产物。真正回写到内容仓库的 `09-日常处理/课表.md` 仍由 GitHub Actions 显式指定输出路径，避免执行层目录混入内容层命名。

当前课表相关能力已经拆成三类产物：

- `09-日常处理/课表.md`
  面向内容阅读的 Markdown 课表
- `09-日常处理/课表.ics`
  面向手动导入日历的 ICS 文件
- `public/schedule.ics`
  面向 GitHub Pages 发布的固定订阅地址

推荐订阅地址：

```text
https://health-525.github.io/jiangshu-study/schedule.ics
```

这条链路的职责边界是：

- `timetable` 负责从 `data/schedule.json` 生成最新 ICS
- `jiangshu-study` 负责承接产物与 Pages 发布
- iPhone / macOS 日历通过“已订阅的日历”消费公开 ICS

## 关键环境变量

从当前脚本实现看，常见环境变量包括：

- `STUDY_DIR`：本地 `jiangshu-study` 路径
- `TIMETABLE_DIR`：当前执行仓库路径
- `DEEPSEEK_API_KEY`：LLM 主接口
- `GLM_API_KEY`：LLM 备用接口
- `AUTO_RESEARCH_SEARCH_PROVIDER`：自主研究搜索源

不同 workflow 还可能需要仓库同步用 token，这部分应以 workflow 文件中的实际 secrets 配置为准。

## 设计原则

- KISS：脚本尽量单职责，一个脚本解决一个明确问题
- DRY：通用能力沉淀在 `scripts/lib/`，避免 workflow 中重复写复杂逻辑
- YAGNI：只保留当前真正运行的链路，不为未来场景预埋过多抽象
- SOLID：
  - `jiangshu-study` 负责内容
  - `timetable` 负责执行
  - `web` 负责展示

## 关联仓库

- `jiangshu-study`：内容层，保存学习产物与人工输入
- `myweb`：展示层，用于对外展示项目能力

## 说明

- 如果日报、周报、知识分析异常，优先看 `scripts/` 日志与 workflow 执行记录
- 如果课表展示异常，优先检查 `data/schedule.json` 与 `web/`
- 如果订阅日历内容异常，优先检查 `scripts/export_ics.js`、`data/schedule.json` 和 `jiangshu-study/public/schedule.ics`
- 如果回写异常，优先核对 `STUDY_DIR`、token 和 workflow 触发链路
