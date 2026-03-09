export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Mon..7=Sun

export interface RawScheduleMeta {
  tz?: string; // e.g. Asia/Shanghai
  week1_monday: string; // ISO date
}

export interface RawCourse {
  title: string;
  weekday: Weekday;
  periods: number[]; // e.g. [1,2]
  weeks: string; // e.g. "2-13" or "1,3,5-7"
  location?: string;
  teacher?: string;
}

export interface RawSpecialItem {
  title: string;
  weekday: Weekday | Weekday[];
  weeks: string;
  times: { start: string; end: string }[];
  location?: string;
  note?: string;
}

export interface RawScheduleData {
  meta: RawScheduleMeta;
  periodTimes?: Record<string, string>; // {"1":"08:10-08:55", ...}
  courses?: RawCourse[];
  special?: RawSpecialItem[];
}

export interface CourseView {
  kind: "course";
  title: string;
  periods: number[];
  timeText?: string; // e.g. 08:10-09:50
  location?: string;
}

export interface SpecialView {
  kind: "special";
  title: string;
  timeText: string; // e.g. 09:00-11:00
  location?: string;
}

export type DayItem = CourseView | SpecialView;

export function parseWeekSpec(spec: string): number[] {
  const s = String(spec || "").replace(/，/g, ",");
  const out = new Set<number>();
  for (const raw of s.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    if (part.includes("-")) {
      const [aStr, bStr] = part.split("-", 2);
      const a = Number(aStr);
      const b = Number(bStr);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      for (let i = start; i <= end; i++) out.add(i);
    } else {
      const n = Number(part);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out].sort((x, y) => x - y);
}

export function weekday1to7(d: Date): Weekday {
  // JS: Sunday=0..Saturday=6
  const js = d.getDay();
  return (js === 0 ? 7 : js) as Weekday;
}

export function getWeekNumber(d: Date, week1MondayIso: string): number {
  const week1 = new Date(week1MondayIso);
  week1.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((dd.getTime() - week1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

function combinePeriodTime(periodTimes: Record<string, string> | undefined, periods: number[]): string | undefined {
  if (!periodTimes || !periods?.length) return undefined;
  const first = periodTimes[String(periods[0])] || "";
  const last = periodTimes[String(periods[periods.length - 1])] || "";
  if (first.includes("-") && last.includes("-")) {
    const start = first.split("-", 1)[0].trim();
    const end = last.split("-", 2)[1].trim();
    if (start && end) return `${start}-${end}`;
  }
  return first || last || undefined;
}

export function parseSchedule(raw: unknown): RawScheduleData {
  const r = raw as { meta?: { week1_monday?: unknown } } | null;
  if (!r || typeof r !== "object" || typeof r.meta?.week1_monday !== "string") {
    throw new Error("Invalid schedule.json: missing meta.week1_monday");
  }
  return raw as RawScheduleData;
}

export function getItemsForDate(schedule: RawScheduleData, date: Date): { weekNum: number; items: DayItem[] } {
  const weekNum = getWeekNumber(date, schedule.meta.week1_monday);
  const wday = weekday1to7(date);

  const items: DayItem[] = [];

  // specials
  for (const s of schedule.special || []) {
    const weeks = parseWeekSpec(s.weeks);
    if (weeks.length && !weeks.includes(weekNum)) continue;

    const wdays = Array.isArray(s.weekday) ? s.weekday : [s.weekday];
    if (!wdays.includes(wday)) continue;

    for (const t of s.times || []) {
      const timeText = [t.start, t.end].filter(Boolean).join("-");
      items.push({ kind: "special", title: s.title, timeText, location: s.location });
    }
  }

  // courses
  for (const c of schedule.courses || []) {
    if (c.weekday !== wday) continue;
    const weeks = parseWeekSpec(c.weeks);
    if (weeks.length && !weeks.includes(weekNum)) continue;

    const timeText = combinePeriodTime(schedule.periodTimes, c.periods);
    items.push({
      kind: "course",
      title: c.title,
      periods: c.periods || [],
      timeText,
      location: c.location,
    });
  }

  // sort: specials first by time, then courses by first period
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "special" ? -1 : 1;
    if (a.kind === "special" && b.kind === "special") return a.timeText.localeCompare(b.timeText);
    const ap = (a as CourseView).periods?.[0] ?? 999;
    const bp = (b as CourseView).periods?.[0] ?? 999;
    return ap - bp;
  });

  return { weekNum, items };
}

export function formatDayResponse(date: Date, weekNum: number, items: DayItem[]): string {
  const dateStr = date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  if (!items.length) {
    return `${dateStr}（第${weekNum}周）\n\n今天没有课`;
  }

  const lines: string[] = [];
  lines.push(`${dateStr}（第${weekNum}周）`);
  lines.push("");

  for (const it of items) {
    if (it.kind === "special") {
      const loc = it.location ? `｜${it.location}` : "";
      lines.push(`- ${it.timeText}｜${it.title}${loc}`);
      continue;
    }
    const p = it.periods;
    const ptxt = p.length ? (p.length === 1 ? `${p[0]}` : `${p[0]}-${p[p.length - 1]}`) : "?";
    const ttxt = it.timeText ? ` ${it.timeText}` : "";
    const loc = it.location ? `｜${it.location}` : "";
    lines.push(`- 第${ptxt}节${ttxt}｜${it.title}${loc}`);
  }

  return lines.join("\n");
}
