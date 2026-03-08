# timetable

一个轻量的 **课表数据化 + 查询** 小工具：把课表整理成 `data/schedule.json`，然后用 CLI 查询「某天有什么课」。

> 目标：**不泄露个人信息**（适合公开仓库）+ 依然 **本地可用**（你自己照常查课表）。

## Features
- 按 **教学周** + **星期** 过滤课程
- 支持 week spec：`2-13` / `1,3,5-7` / `2-17` …
- 输出：日期、周次、节次时间、课程名、地点
- 支持「特殊安排」：如实践周（非节次、按时间段）

## Project Layout
```text
timetable/
  data/
    schedule.json            # 课表数据（主数据源）
    assignments.json         # （可选）作业/任务清单
  inbound/                   # 原始输入（注意：默认不提交 PDF）
  scripts/
    extract_from_pdf.py      # 从 PDF 抽取到 data/schedule.json
  schedule.py                # CLI 入口
  requirements.txt
```

## Quickstart

### 1) 安装依赖
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2) 查询课表
```bash
python3 schedule.py today
python3 schedule.py 2026-03-04
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
