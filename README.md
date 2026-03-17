# timetable

一个轻量的 **课表数据化 + 查询** 小工具：把课表整理成 `data/schedule.json`，然后用 CLI 查询「某天有什么课」。

> 目标：**不泄露个人信息**（适合公开仓库）+ 依然 **本地可用**（你自己照常查课表）。

## Features
- 按 **教学周** + **星期** 过滤课程
- 支持 week spec：`2-13` / `1,3,5-7` / `2-17` …
- 输出：日期、周次、节次时间、课程名、地点
- 支持「特殊安排」：如实践周（非节次、按时间段）
- 支持 **调课自动同步**：在 `jiangshu-study/调课.md` 填写并推送后，GitHub Actions 会自动解析并写入 `timetable/data/adjustments.json`，并把已处理条目归档

## Project Layout

> 前端（对话式查课表）位于 `web/`：Next.js 项目，可独立部署（例如 Vercel）。


```text
timetable/
  data/
    schedule.json            # 课表数据（主数据源）
    adjustments.json         # （自动生成）调课/临时调整记录（由 Actions 写入）
    assignments.json         # （可选）作业/任务清单
  inbound/                   # 原始输入（注意：默认不提交 PDF）
  scripts/
    extract_from_pdf.py      # 从 PDF 抽取到 data/schedule.json
  schedule.py                # CLI 入口
  requirements.txt
```

## Quickstart（给第一次用的人）

### 0) Clone
```bash
git clone https://github.com/Health-525/timetable.git
cd timetable
```

### 1) 安装依赖
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2) 准备你的课表数据（两种方式二选一）

**方式 A：从 PDF 抽取（推荐）**
1. 把课表 PDF 放到：`inbound/schedule.pdf`
2. 运行：
```bash
python3 scripts/extract_from_pdf.py
```
会生成：`data/schedule.json`

**方式 B：手动维护 JSON**
- 直接编辑/创建：`data/schedule.json`

> 注意：`inbound/` 下的 PDF 很可能包含姓名/学号等个人信息，**不要提交到 GitHub**（本仓库已 `.gitignore` 忽略 `inbound/*.pdf`）。

### 3) 查询课表
```bash
python3 schedule.py today
python3 schedule.py 2026-03-04
```

### 4) 运行前端（可选，推荐）
```bash
cd web
npm install
npm run dev
# 打开 http://localhost:3000
```

可指定数据文件路径：
```bash
TIMETABLE_SCHEDULE=/path/to/schedule.json python3 schedule.py today
```

## Data Spec（data/schedule.json）
- `meta.tz`：时区（默认 `Asia/Shanghai`）
- `meta.week1_monday`：第 1 周周一（ISO 日期）
- `periodTimes`：节次 → 时间段（例如 `{"1":"08:10-08:55"}`）
- `courses[]`：
  - `title`：课程名
  - `weekday`：1=Mon ... 7=Sun
  - `periods`：例如 `[1,2]`
  - `weeks`：例如 `2-13` / `1,3,5-7`
  - `location`：上课地点（可留空）
  - `teacher`：教师（可留空）
- `special[]`：非节次类安排（时间段）

## 调课自动同步（Obsidian → GitHub Actions → timetable）

> 目标：你只在 Obsidian（`jiangshu-study`）里维护一份 `调课.md`，系统自动把“已确认的调课”同步成机器可读数据（`adjustments.json`），供 CLI/前端查询时使用。

### 1) 在 jiangshu-study 填写调课（frontmatter）
编辑：`jiangshu-study/调课.md` 顶部 frontmatter（状态需为 **待处理**）。

字段要求（严格）：
- 原星期/目标星期：`周一`…`周日`
- 原节次/目标节次：`1-2` / `3-4` / `5-6` / `7-8` / `9-10`
- 类型：`单次` / `长期`
- 周次：数字（例如 `5`；允许写成 `"5"`，已兼容）

### 2) 触发方式
- 你把 `调课.md` push 到 GitHub 后，会触发 `timetable` 仓库的 `parse-adjustments` workflow（`repository_dispatch: obsidian-push`）。

### 3) 处理结果
- `timetable/data/adjustments.json`：新增一条 adjustment 记录
- `jiangshu-study/调课.md`：该条目会被归档到「已处理记录」，并把 frontmatter 重置为空模板

### 常见失败原因（看 Actions 日志）
- `星期格式错误`：写成了 `"5"/5/星期一` 等；必须是 `周一..周日`
- `节次格式错误`：必须是 `1-2/3-4/5-6/7-8/9-10`
- `周次格式错误`：必须是数字（或被引号包着的数字）

## Privacy / 安全实践（公开仓库必读）
- **不要提交**：课表 PDF / 截图 / 含姓名、学号、手机号、班级、账号信息的任何原始材料。
- 本仓库已在 `.gitignore` 中忽略：`inbound/*.pdf`。
- 如果你需要从 PDF 抽取：把 PDF 放进 `inbound/` 后在本地运行抽取脚本即可（PDF 不要提交到 GitHub）。

## 从 PDF 抽取（可选）
1) 把 PDF 放到：`inbound/schedule.pdf`
2) 运行：
```bash
python3 scripts/extract_from_pdf.py
```
会生成/覆盖：`data/schedule.json`（尽量保留已有的 `meta/periodTimes`）。

---

如果你希望 README 更“产品化”（加 badge、示例输出、截图、FAQ），我可以继续再迭代一版。
