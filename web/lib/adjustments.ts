import { RawCourse, RawScheduleData, DayItem, CourseView, getWeekNumber, weekday1to7, Weekday } from "./schedule";

export type AdjustmentMode = "once" | "longterm";

export interface Adjustment {
  id: string;
  // 原课信息
  sourceWeekday: Weekday;
  sourcePeriods: number[];
  // 目标信息
  targetWeekday: Weekday;
  targetPeriods: number[];
  // 模式
  mode: AdjustmentMode;
  // 生效周次（单次：具体某周；长期：从第N周开始）
  startWeek: number;
  // 单次模式下的具体周次（可选，默认等于 startWeek）
  specificWeek?: number;
  createdAt: number;
}

const STORAGE_KEY = "timetable_adjustments_v1";

/**
 * 从 localStorage 读取调课记录
 */
export function loadAdjustments(): Adjustment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Adjustment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 保存调课记录到 localStorage
 */
export function saveAdjustments(adjustments: Adjustment[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adjustments));
  } catch {
    // ignore
  }
}

/**
 * 添加调课记录
 */
export function addAdjustment(adj: Omit<Adjustment, "id" | "createdAt">): Adjustment {
  const adjustments = loadAdjustments();
  const newAdj: Adjustment = {
    ...adj,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
  };
  adjustments.push(newAdj);
  saveAdjustments(adjustments);
  return newAdj;
}

/**
 * 撤销最近一次调课
 */
export function undoLastAdjustment(): Adjustment | null {
  const adjustments = loadAdjustments();
  if (adjustments.length === 0) return null;
  const removed = adjustments.pop()!;
  saveAdjustments(adjustments);
  return removed;
}

/**
 * 检查调课是否对指定周次生效
 */
export function isAdjustmentActive(adj: Adjustment, weekNum: number): boolean {
  if (adj.mode === "once") {
    const targetWeek = adj.specificWeek ?? adj.startWeek;
    return weekNum === targetWeek;
  }
  // longterm: 从 startWeek 起一直生效
  return weekNum >= adj.startWeek;
}

/**
 * 获取指定日期应用调课后的课程列表
 * 基于原始 schedule 数据，应用 adjustments 后返回 DayItem[]
 */
export function getAdjustedItemsForDate(
  schedule: RawScheduleData,
  date: Date,
  adjustments: Adjustment[]
): { weekNum: number; items: DayItem[] } {
  const weekNum = getWeekNumber(date, schedule.meta.week1_monday);
  const wday = weekday1to7(date);

  // 过滤出当前生效的调课
  const activeAdjs = adjustments.filter((adj) => isAdjustmentActive(adj, weekNum));

  const items: DayItem[] = [];

  // 处理课程
  for (const c of schedule.courses || []) {
    // 检查是否有调课规则匹配此课程（原课位置）
    const matchingAdj = activeAdjs.find(
      (adj) =>
        adj.sourceWeekday === c.weekday &&
        arraysEqual(adj.sourcePeriods, c.periods)
    );

    if (matchingAdj) {
      // 应用调课：改为目标位置
      if (matchingAdj.targetWeekday === wday) {
        items.push(buildCourseView(c, matchingAdj.targetPeriods, schedule));
      }
      // 原位置不显示此课程
    } else if (c.weekday === wday) {
      // 正常显示
      items.push(buildCourseView(c, c.periods, schedule));
    }
  }

  // Special items 不受调课影响
  for (const s of schedule.special || []) {
    const weeks = parseWeekSpec(s.weeks);
    if (weeks.length && !weeks.includes(weekNum)) continue;

    const wdays = Array.isArray(s.weekday) ? s.weekday : [s.weekday];
    if (!wdays.includes(wday)) continue;

    for (const t of s.times || []) {
      const timeText = [t.start, t.end].filter(Boolean).join("-");
      items.push({ kind: "special" as const, title: s.title, timeText, location: s.location });
    }
  }

  // 排序
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "special" ? -1 : 1;
    if (a.kind === "special" && b.kind === "special") return a.timeText.localeCompare(b.timeText);
    const ap = (a as CourseView).periods?.[0] ?? 999;
    const bp = (b as CourseView).periods?.[0] ?? 999;
    return ap - bp;
  });

  return { weekNum, items };
}

function buildCourseView(c: RawCourse, periods: number[], schedule: RawScheduleData): CourseView {
  const timeText = combinePeriodTime(schedule.periodTimes, periods);
  return {
    kind: "course" as const,
    title: c.title,
    periods,
    timeText,
    location: c.location,
    teacher: c.teacher,
  };
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

function parseWeekSpec(spec: string): number[] {
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

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * 检查目标槽位是否有冲突
 */
export function checkConflict(
  schedule: RawScheduleData,
  adjustments: Adjustment[],
  targetWeekday: Weekday,
  targetPeriods: number[],
  weekNum: number,
  excludeAdjId?: string
): { hasConflict: boolean; conflictWith?: string } {
  // 获取该周该天的所有课程（含已应用的调课）
  const activeAdjs = adjustments.filter(
    (adj) => adj.id !== excludeAdjId && isAdjustmentActive(adj, weekNum)
  );

  // 检查是否有其他课程占用了目标位置
  for (const c of schedule.courses || []) {
    // 确定课程在该周该天的实际位置
    const adj = activeAdjs.find(
      (a) => a.sourceWeekday === c.weekday && arraysEqual(a.sourcePeriods, c.periods)
    );
    const actualWeekday = adj ? adj.targetWeekday : c.weekday;
    const actualPeriods = adj ? adj.targetPeriods : c.periods;
    if (actualWeekday === targetWeekday && periodsOverlap(actualPeriods, targetPeriods)) {
      return { hasConflict: true, conflictWith: c.title };
    }
  }

  return { hasConflict: false };
}

function periodsOverlap(a: number[], b: number[]): boolean {
  return a.some((p) => b.includes(p));
}