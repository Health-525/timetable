# timetable

一个轻量的**课表查询工具**：把课表结构化成 `schedule.json`，然后用 CLI 查询「某天有什么课」。

## 功能
- 根据 **教学周** + **星期** 过滤课程
- 支持 week spec：`2-13` / `1,3,5-7` / `2-17` 等
- 输出：日期、周次、节次时间、课程名、地点

## 项目结构
```text
timetable/
  data/
    schedule.json            # 课表数据（主数据源）
    assignments.json         # （可选）作业/任务清单
  inbound/                   # 原始输入（例如：课表 PDF）
  scripts/
    extract_from_pdf.py      # 从 PDF 抽取到 data/schedule.json
  schedule.py                # CLI 入口
  requirements.txt
```

## 快速开始

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

如果你想指定数据文件位置：
```bash
TIMETABLE_SCHEDULE=/path/to/schedule.json python3 schedule.py today
```

## 数据格式（data/schedule.json）
- `meta.tz`：时区（默认 `Asia/Shanghai`）
- `meta.week1_monday`：第 1 周周一（ISO 日期）
- `periodTimes`：节次 → 时间段（例如 `{"1":"08:10-08:55"}`）
- `courses[]`：
  - `title`：课程名
  - `weekday`：1=Mon ... 7=Sun
  - `periods`：例如 `[1,2]`
  - `weeks`：例如 `2-13` / `1,3,5-7`
  - `location` / `teacher`

## 从 PDF 抽取（可选）
把 PDF 放到：`inbound/schedule.pdf`，然后运行：
```bash
python3 scripts/extract_from_pdf.py
```
它会生成/覆盖：`data/schedule.json`（会尽量保留已有的 `meta/periodTimes`）。

## 备注
- 这是一个小工具仓库，优先追求：**可读、可改、可复用**。
- 欢迎把你自己的课表字段/特殊周安排（如实践周）补充进 `data/schedule.json`。
