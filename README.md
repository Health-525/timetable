# timetable

> 课表数据化 + 全自动化处理中枢 · 为 [jiangshu-study](https://github.com/Health-525/jiangshu-study) 提供后端支撑
>
> 属于 [MyDigitalCrew](https://github.com/Health-525/MyDigitalCrew) — 10 个 AI Agent 组成的个人学习管理数字团队

---

## 🎯 核心架构原则

```
┌─────────────────────────────────────────────────────────────┐
│                    MyDigitalCrew 学习系统                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  jiangshu-study (内容层)         timetable (执行层)          │
│  ─────────────────────         ─────────────────────         │
│  • 纯 Markdown 内容             • 处理逻辑脚本                │
│  • Obsidian 笔记仓库            • GitHub Actions             │
│  • 人工编辑                     • 数据存储 (JSON)            │
│  • 读取产物                     • 生成产物                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**职责分离：**
- **jiangshu-study**：只存文本，供人类阅读和编辑
- **timetable**：只跑逻辑，机器自动化处理

---

## 📋 仓库功能

本仓库承担所有**执行逻辑**，`jiangshu-study` 只存文本。通过 GitHub Actions 实现：

- ✅ 每日自动生成课表（北京时间 06:00）
- ✅ 解析作业并推送倒计时提醒
- ✅ 解析调课并更新课表数据
- ✅ 自动生成日报 / 周报
- ✅ 知识空白分析与自主研究
- ✅ 阳光长跑热力图追踪

### 当前解耦原则

- **只连接必要链路**：目前只有 `调课 -> 课表生成`、`知识分析 -> 自主研究` 这类确实存在上下游关系的流程会显式串联
- **其余 Agent 默认独立运行**：日报、周报、作业、跑步等流程不再因为“挂在同一总线”而彼此耦合
- **发布留在 workflow**：脚本只负责生成或更新产物，真正的 `git commit / push` 放在 GitHub Actions 中统一处理
- **分析快照与处理进度分离**：`_out/learning_gaps.json` 保留分析结果，`_state/research-progress.json` 单独记录自主研究进度

---

## 📂 目录结构

```
timetable/
├── .github/workflows/         # GitHub Actions 自动化工作流
│   ├── 生成课表.yml           # 每日 06:00 自动生成课表
│   ├── 处理作业.yml           # 解析作业.md，更新提醒
│   ├── 处理调课.yml           # 解析调课.md，更新数据
│   ├── 处理阳光长跑.yml       # 解析阳光长跑.md，生成热力图
│   ├── 同步YouTube笔记.yml    # YouTube 笔记同步（当前已暂停）
│   └── 提取视频笔记.yml       # 手动提取单个视频笔记
├── data/                      # 数据存储（JSON 格式）
│   ├── schedule.json          # 课表数据（主数据源）
│   ├── adjustments.json       # 调课记录
│   ├── assignments.json       # 作业记录
│   └── running.json           # 阳光长跑记录
├── scripts/                   # 处理脚本
│   ├── schedule.js            # CLI 查课表工具
│   ├── generate-timetable.js  # 生成课表.md
│   ├── parse_assignments.js   # 解析作业.md
│   ├── parse_adjustments.js   # 解析调课.md
│   ├── parse_running.js       # 解析阳光长跑.md
│   ├── youtube_daily_to_study.js  # YouTube 笔记同步
│   ├── fetch_video_note.js    # 单视频笔记提取
│   └── extract_from_pdf.py    # 从 PDF 提取课表
└── web/                       # Next.js 前端（已弃用）
```

---

## 🔄 自动化流程

### 1️⃣ 课表生成流程

```
data/schedule.json (数据源)
         ↓
[生成课表.yml] 每日 06:00 自动
         ↓
generate-timetable.js 读取 JSON
         ↓
生成 jiangshu-study/09-日常处理/课表.md
         ↓
推送回 jiangshu-study 仓库
```

### 2️⃣ 作业管理流程

```
jiangshu-study/09-日常处理/作业.md (人工填写)
         ↓
推送 → 触发 [处理作业.yml]
         ↓
parse_assignments.js 解析 Markdown
         ↓
更新 data/assignments.json
         ↓
更新 作业.md 顶部（添加倒计时提醒）
         ↓
推送回 jiangshu-study
```

### 3️⃣ 触发链路

```
jiangshu-study 推送作业.md / 调课.md / 阳光长跑.md
       ↓
[sync_to_timetable.yml] 检测变化
       ↓
发送 repository_dispatch 事件到 timetable
       ↓
对应 workflow 执行
       ↓
结果写回 jiangshu-study
```

---

## 💻 本地使用

### 前置要求
- Node.js >= 20
- Python >= 3.8（用于 PDF 解析）

### 安装依赖

```bash
# 安装 Node.js 依赖
cd scripts
npm install

# 安装 Python 依赖（可选）
pip install -r requirements.txt
```

### CLI 工具

```bash
# 查今日课表
node scripts/schedule.js today

# 查指定日期
node scripts/schedule.js 2026-03-27

# 设置自定义课表路径
set TIMETABLE_SCHEDULE=path/to/schedule.json
node scripts/schedule.js today
```

---

## 🔐 Secrets 配置

| Secret | 用途 | 必需 |
|--------|------|------|
| `STUDY_PUSH_TOKEN` | 读写 jiangshu-study 仓库 | ✅ 必需 |
| `TIMETABLE_DISPATCH_TOKEN` | jiangshu-study 触发本仓库 | ✅ 必需 |
| `DEEPSEEK_API_KEY` | YouTube 笔记 AI 分析 | ⚠️ 可选 |
| `GLM_API_KEY` | YouTube 笔记 AI 分析（备用）| ⚠️ 可选 |
| `YOUTUBE_COOKIES` | YouTube 访问 Cookie | ⚠️ 可选 |

---

## 📊 数据格式

### schedule.json

```json
{
  "meta": {
    "tz": "Asia/Shanghai",
    "week1_monday": "2026-03-02"
  },
  "periodTimes": {
    "1": "08:10-08:55",
    "2": "09:05-09:50"
  },
  "courses": [
    {
      "title": "数值分析",
      "weekday": 2,
      "periods": [5, 6],
      "weeks": "2-17",
      "location": "笃学B楼 202",
      "teacher": ""
    }
  ]
}
```

### assignments.json

```json
[
  {
    "id": "a-xxx",
    "course": "数值分析",
    "title": "上机作业",
    "deadline": "2026-03-27T15:59:00.000Z",
    "done": false,
    "createdAt": "2026-03-21T05:25:38.276Z"
  }
]
```

---

## ⚠️ 重要提示

- **公开仓库**：请勿提交含个人信息的原始材料（课表 PDF 等）
- **数据源单一**：所有数据以 `data/` 目录的 JSON 文件为准
- **bot 提交**：自动生成的提交由 `timetable-bot` 完成，避免循环触发

---

## 🚀 GitHub Actions 工作流

| Workflow | 触发方式 | 功能 |
|---------|---------|------|
| 生成课表.yml | 每天 06:00 / dispatch / 手动 | 生成课表.md |
| 处理作业.yml | dispatch / 每天 22:00 | 解析作业、更新倒计时 |
| 处理调课.yml | dispatch / 手动 | 解析调课、更新数据，并触发课表刷新 |
| 处理阳光长跑.yml | dispatch / 手动 | 生成热力图 |
| 生成日报.yml | 每天 22:00 / dispatch / 手动 | 生成并发布日报 |
| 生成周报.yml | 每周日 22:30 / 手动 | 生成并发布周报 |
| 知识分析-自主研究.yml | 每天 21:00 / 手动 | 先分析 gap，再触发自主研究 |
| 同步YouTube笔记.yml | 已暂停 | YouTube 笔记同步（当前不执行） |
| 提取视频笔记.yml | 手动（需提供URL）| 单视频笔记提取 |

