# Table Time

一个 **对话式课表查询** 的纯前端项目（Next.js App Router + TypeScript + Tailwind）。

- 你输入：`today/今天`、`明天`、`周一`、`2026-03-12`
- 它输出：当天课程（节次时间/课程名/地点）

## 为什么是“纯前端”
- 所有解析都在浏览器完成：不需要后端、不存储任何个人数据。
- 适合把课表数据放在一个公开的 JSON 地址（或局域网地址）。

## 数据源（默认）
默认从 timetable 项目读取：

`https://raw.githubusercontent.com/Health-525/timetable/main/data/schedule.json`

你可以用环境变量覆盖：

1) 复制一份示例：
```bash
cp .env.local.example .env.local
```

2) 修改 `.env.local`：
```env
NEXT_PUBLIC_SCHEDULE_URL=https://your-domain.com/schedule.json
```

## 本地运行
```bash
npm install
npm run dev
# http://localhost:3000
```

## 支持的输入
- today / 今天 / 今日
- 明天 / 明日
- 周一/周二/…（默认指“下一个该星期几”，避免和今天冲突）
- YYYY-MM-DD（如 2026-03-12）

## 兼容的数据格式
本项目直接兼容 `timetable/data/schedule.json`（字段包括：`meta.week1_monday`、`periodTimes`、`courses[]`、`special[]`）。

## 隐私
- 不要把原始课表 PDF 放到公网。
- 这个前端只拉取 JSON 并在本地解析；不上传任何内容。

## Pages
- `/`：Chat 查询
- `/about`：隐私说明
