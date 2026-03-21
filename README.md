# timetable

> 课表数据化 + 全自动化处理中枢 · 为 [jiangshu-study](https://github.com/Health-525/jiangshu-study) 提供后端支撑

---

## 概览

本仓库承担所有**执行逻辑**，`jiangshu-study` 只存文本。通过 GitHub Actions 实现：

- 每日自动生成课表
- 解析作业并推送提醒
- 解析调课并更新数据
- 每日同步 YouTube 笔记

---

## 仓库结构

```
timetable/
├── data/
│   ├── schedule.json       # 课表数据（主数据源）
│   ├── adjustments.json    # 调课记录（Actions 自动写入）
│   └── assignments.json    # 作业记录（Actions 自动写入）
├── scripts/
│   ├── parse_assignments.js    # 解析作业
│   ├── parse_adjustments.js    # 解析调课
│   ├── youtube_daily_to_study.js  # YouTube 笔记同步
│   └── extract_from_pdf.py     # 从 PDF 提取课表
├── web/                    # Next.js 前端（可选，Vercel 部署）
└── schedule.py             # CLI 查课表
```

---

## GitHub Actions

| Workflow | 触发 | 功能 |
|---------|------|------|
| `生成课表.yml` | 每天 06:00 / 手动 | 生成课表.md 写回 jiangshu-study |
| `处理作业.yml` | `assignments-push` dispatch | 解析作业.md，更新提醒列表 |
| `处理调课.yml` | `adjustments-push` dispatch | 解析调课.md，更新 adjustments.json |
| `同步YouTube笔记.yml` | 每天 07:00 / 手动 | 分析 YouTube 视频并写回笔记 |

触发链路：

```
jiangshu-study 推送作业.md / 调课.md
       ↓
通知timetable处理.yml 发送 dispatch 事件
       ↓
timetable 对应 workflow 执行
       ↓
结果写回 jiangshu-study
```

---

## 数据格式

### schedule.json

```json
{
  "meta": {
    "tz": "Asia/Shanghai",
    "week1_monday": "2026-03-02"
  },
  "periodTimes": {
    "1": "08:10-08:55"
  },
  "courses": [
    {
      "title": "数值分析",
      "weekday": 2,
      "periods": [5, 6],
      "weeks": "2-17",
      "location": "笃学B楼 202",
      "teacher": "石玮"
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

## 本地使用

```bash
# 安装依赖
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 查今日课表
python3 schedule.py today

# 查指定日期
python3 schedule.py 2026-03-27

# 启动前端
cd web && npm install && npm run dev
```

---

## Secrets 配置

| Secret | 用途 |
|--------|------|
| `STUDY_PUSH_TOKEN` | 读写 jiangshu-study 仓库 |
| `TIMETABLE_DISPATCH_TOKEN` | 从 jiangshu-study 触发 timetable dispatch |
| `DEEPSEEK_API_KEY` | YouTube 笔记 AI 分析 |
| `GLM_API_KEY` | YouTube 笔记 AI 分析（备用）|
| `YOUTUBE_COOKIES` | YouTube 访问 Cookie |

---

> 公开仓库，请勿提交含个人信息的原始材料（课表 PDF 等）
