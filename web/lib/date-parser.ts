import { getNowInTimeZone, normalizeDate } from "./timezone";

/**
 * 解析日期输入字符串
 * 使用 Asia/Shanghai 时区避免跨时区问题
 */
export function parseDateInput(input: string): Date | null {
  const normalized = input.trim().toLowerCase();
  
  // 使用统一的时区处理函数
  const today = normalizeDate(getNowInTimeZone("Asia/Shanghai"));
  
  // today / 今天
  if (normalized === "today" || normalized === "今天" || normalized === "今日" || normalized === "本周") {
    return today;
  }

  // next week / 下周 — interpret as next Monday
  if (normalized === "next week" || normalized === "下周" || normalized === "下星期") {
    const current = today.getDay(); // 0=Sun..6=Sat
    let diff = (1 - current + 7) % 7;
    if (diff === 0) diff = 7;
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d;
  }
  
  // tomorrow / 明天
  if (normalized === "tomorrow" || normalized === "明天" || normalized === "明日") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // this weekend / 周末 — return upcoming Saturday (Asia/Shanghai)
  if (normalized === "weekend" || normalized === "周末") {
    const current = today.getDay(); // 0=Sun..6=Sat
    const target = 6; // Saturday
    let diff = target - current;
    if (diff < 0) diff += 7;
    if (diff === 0) diff = 7; // next Saturday if today is Saturday
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d;
  }

  // next monday / 下周一 — Monday of next week
  if (normalized === "next monday" || normalized === "下周一" || normalized === "下星期一") {
    const current = today.getDay(); // 0=Sun..6=Sat
    // Monday of next week (rolling): if today is Monday -> +7, else next upcoming Monday
    let diff = (1 - current + 7) % 7;
    if (diff === 0) diff = 7;
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d;
  }
  
  // yesterday / 昨天
  if (normalized === "yesterday" || normalized === "昨天" || normalized === "昨日") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  
  // weekday names
  const weekdayMap: Record<string, number> = {
    "周一": 1, "星期一": 1, "monday": 1, "mon": 1,
    "周二": 2, "星期二": 2, "tuesday": 2, "tue": 2,
    "周三": 3, "星期三": 3, "wednesday": 3, "wed": 3,
    "周四": 4, "星期四": 4, "thursday": 4, "thu": 4,
    "周五": 5, "星期五": 5, "friday": 5, "fri": 5,
    "周六": 6, "星期六": 6, "saturday": 6, "sat": 6,
    "周日": 0, "星期天": 0, "星期日": 0, "sunday": 0, "sun": 0,
  };
  
  if (weekdayMap[normalized] !== undefined) {
    const targetDay = weekdayMap[normalized];
    const currentDay = today.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) diff += 7;
    if (diff === 0) diff = 7; // Next week if today
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diff);
    return targetDate;
  }
  
  // YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateRegex.test(normalized)) {
    // 手动解析避免时区问题
    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime()) && date.getFullYear() === year) {
      return normalizeDate(date);
    }
  }
  
  // MM-DD format (current year)
  const shortDateRegex = /^\d{1,2}-\d{1,2}$/;
  if (shortDateRegex.test(normalized)) {
    const [month, day] = normalized.split("-").map(Number);
    const date = new Date(today.getFullYear(), month - 1, day);
    if (!isNaN(date.getTime())) {
      return normalizeDate(date);
    }
  }
  
  return null;
}

/**
 * 获取周数
 */
export function getWeekNumber(date: Date, week1MondayStr: string): number {
  const week1Monday = new Date(week1MondayStr);
  const targetDate = normalizeDate(date);
  
  const diffTime = targetDate.getTime() - week1Monday.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDateKey(date: Date): string {
  const d = normalizeDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
