export function parseDateInput(input: string): Date | null {
  const normalized = input.trim().toLowerCase();
  // Use Asia/Shanghai to avoid timezone surprises
  const nowBJ = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const today = new Date(nowBJ);
  today.setHours(0, 0, 0, 0);
  
  // today / 今天
  if (normalized === "today" || normalized === "今天" || normalized === "今日") {
    return today;
  }
  
  // tomorrow / 明天
  if (normalized === "tomorrow" || normalized === "明天" || normalized === "明日") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
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
    const date = new Date(normalized);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // MM-DD format (current year)
  const shortDateRegex = /^\d{1,2}-\d{1,2}$/;
  if (shortDateRegex.test(normalized)) {
    const [month, day] = normalized.split("-").map(Number);
    const date = new Date(today.getFullYear(), month - 1, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

export function getWeekNumber(date: Date, week1MondayStr: string): number {
  const week1Monday = new Date(week1MondayStr);
  week1Monday.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  const diffTime = targetDate.getTime() - week1Monday.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}