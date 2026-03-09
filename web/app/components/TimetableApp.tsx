"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DayItem,
  formatDayResponse,
  getItemsForDate,
  RawScheduleData,
  weekday1to7,
} from "@/lib/schedule";
import { parseDateInput } from "@/lib/date-parser";

type TabKey = "today" | "week" | "query";

type SelectedCourse = {
  title: string;
  location?: string;
  teacher?: string;
  timeText?: string;
  periods?: number[];
  dateLabel?: string;
};

function getNowInTimeZone(tz: string) {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}

type NextCourseInfo = {
  item: DayItem;
  startTime: Date;
  endTime: Date;
} | null;

function parseTimeToDate(today: Date, timeStr: string) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(today);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function getNextCourse(schedule: RawScheduleData, today: Date, tz: string): NextCourseInfo {
  const { items } = getItemsForDate(schedule, today);
  if (!items.length) return null;

  const now = getNowInTimeZone(tz);

  for (const item of items) {
    if (!item.timeText) continue;
    const [start, end] = item.timeText.split("-");
    if (!start || !end) continue;

    const startTime = parseTimeToDate(today, start.trim());
    const endTime = parseTimeToDate(today, end.trim());
    if (endTime > now) return { item, startTime, endTime };
  }

  return null;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "已开始";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分${seconds.toString().padStart(2, "0")}秒`;
}

function CountdownTimer({ targetTime, tz }: { targetTime: Date; tz: string }) {
  const [remaining, setRemaining] = useState(() => {
    const now = getNowInTimeZone(tz);
    return targetTime.getTime() - now.getTime();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = getNowInTimeZone(tz);
      setRemaining(targetTime.getTime() - now.getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime, tz]);

  return <span className="tabular-nums">{formatCountdown(remaining)}</span>;
}


function DayCard({
  title,
  weekNum,
  items,
  rawText,
  onSelect,
}: {
  title: string;
  weekNum: number;
  items: DayItem[];
  rawText: string;
  onSelect?: (c: SelectedCourse) => void;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
            第{weekNum}周
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(rawText);
            } catch {
              // ignore
            }
          }}
          className="px-3 py-1.5 text-[12px] rounded-full active:scale-95"
          style={{
            backgroundColor: "rgba(255,122,26,0.12)",
            color: "var(--accent)",
            border: "1px solid rgba(255,122,26,0.18)",
          }}
        >
          复制
        </button>
      </div>

      {!items.length ? (
        <div className="text-[13px] mt-3" style={{ color: "var(--text-secondary)" }}>
          没有课
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((it, idx) => {
            const timeText = it.kind === "special" ? it.timeText : it.timeText || "";
            const sub = [
              it.location || "",
              it.kind === "course" && it.teacher ? it.teacher : "",
              it.kind === "course" ? `第${it.periods?.[0] ?? "?"}节起` : "",
            ]
              .filter(Boolean)
              .join("｜");
            const c = it.kind === "course" ? courseColor(it.title) : null;
            return (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  it.kind === "course" && onSelect
                    ? onSelect({
                        title: it.title,
                        location: it.location,
                        teacher: it.teacher,
                        timeText: it.timeText,
                        periods: it.periods,
                        dateLabel: title,
                      })
                    : undefined
                }
                className="rounded-2xl px-3 py-2 text-left transition-transform active:scale-[0.99]"
                style={{
                  backgroundColor: c ? c.bg : "rgba(255,122,26,0.08)",
                  border: c ? `1px solid ${c.border}` : "1px solid rgba(255,122,26,0.14)",
                }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {it.title}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--accent)" }}>
                    {timeText}
                  </div>
                </div>
                {sub ? (
                  <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    {sub}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function courseHue(title: string) {
  // Subject-like heuristics → fixed palette (more "student app" feel)
  const rules: Array<[RegExp, number]> = [
    [/体育|跆拳道|篮球|足球|羽毛球|游泳/, 145],
    [/马克思|毛泽东|形势|政策|思政/, 5],
    [/数学|统计|数值|模型|线性|微积分|概率/, 210],
    [/Python|编程|算法|数据结构|大数据|软件/, 280],
    [/英语|日语|德语|法语|语言/, 35],
    [/实验|实践|实训|劳动/, 90],
  ];
  for (const [re, hue] of rules) if (re.test(title)) return hue;
  return hashHue(title);
}

function courseColor(title: string) {
  const hue = courseHue(title);
  return {
    bg: `hsla(${hue}, 85%, 92%, 0.92)`,
    border: `hsla(${hue}, 70%, 55%, 0.55)`,
    accent: `hsl(${hue}, 70%, 40%)`,
  };
}

function WeekGrid({
  schedule,
  baseDate,
  onSelect,
}: {
  schedule: RawScheduleData;
  baseDate: Date;
  onSelect?: (c: SelectedCourse) => void;
}) {
  const w = weekday1to7(baseDate);
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (w - 1));

  // Build per-day items using the existing week-number filtering.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const { weekNum, items } = getItemsForDate(schedule, d);
    return { date: d, weekNum, items };
  });

  const dayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  return (
    <section
      className="rounded-2xl p-3"
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between gap-3 px-2 pb-2">
        <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          本周课表（第{days[0]?.weekNum ?? "?"}周）
        </div>
        <button
          type="button"
          onClick={async () => {
            const { buildWeekICS } = await import("@/lib/ics");
            const ics = buildWeekICS(schedule, baseDate);
            const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `上早八-第${days[0]?.weekNum ?? "?"}周.ics`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}
          className="px-3 py-1.5 text-[12px] rounded-full active:scale-95"
          style={{
            backgroundColor: "rgba(255,122,26,0.12)",
            color: "var(--accent)",
            border: "1px solid rgba(255,122,26,0.18)",
          }}
        >
          导出日历
        </button>
      </div>

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))",
          gridTemplateRows: "28px repeat(10, 54px)",
        }}
      >
        {/* Top-left corner */}
        <div />

        {/* Day headers */}
        {days.map((d, i) => (
          <div
            key={i}
            className="text-[12px] flex items-center justify-center rounded-lg"
            style={{
              backgroundColor: "rgba(255,122,26,0.08)",
              border: "1px solid rgba(255,122,26,0.12)",
              color: "var(--text-primary)",
            }}
          >
            {dayLabels[i]}
            <span className="ml-1" style={{ color: "var(--text-secondary)" }}>
              {d.date.getMonth() + 1}/{d.date.getDate()}
            </span>
          </div>
        ))}

        {/* Period labels */}
        {Array.from({ length: 10 }, (_, idx) => (
          <div
            key={idx}
            className="text-[12px] flex items-center justify-center rounded-lg"
            style={{
              backgroundColor: "rgba(255,122,26,0.06)",
              border: "1px solid rgba(255,122,26,0.10)",
              color: "var(--text-secondary)",
            }}
          >
            {idx + 1}
          </div>
        ))}

        {/* Empty grid cells (background) */}
        {Array.from({ length: 10 * 7 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg"
            style={{
              backgroundColor: "rgba(255,255,255,0.6)",
              border: "1px dashed rgba(201,178,168,0.35)",
            }}
          />
        ))}

        {/* Course blocks */}
        {days.flatMap((d, dayIdx) => {
          return d.items
            .filter((it) => it.kind === "course")
            .map((it, idx) => {
              const periods = it.periods || [];
              const start = periods[0] ?? 1;
              const end = periods[periods.length - 1] ?? start;
              const { bg, border } = courseColor(it.title);

              return (
                <button
                  key={`c-${dayIdx}-${idx}-${it.title}`}
                  type="button"
                  onClick={() =>
                    onSelect?.({
                      title: it.title,
                      location: it.location,
                      teacher: it.teacher,
                      timeText: it.timeText,
                      periods: it.periods,
                      dateLabel: `${dayLabels[dayIdx]} ${d.date.getMonth() + 1}/${d.date.getDate()}`,
                    })
                  }
                  className="rounded-xl px-2 py-1 overflow-hidden text-left transition-transform active:scale-[0.99]"
                  style={{
                    gridColumn: `${dayIdx + 2} / span 1`,
                    gridRow: `${start + 1} / ${end + 2}`,
                    backgroundColor: bg,
                    border: `1px solid ${border}`,
                    zIndex: 2,
                  }}
                >
                  <div className="text-[12px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                    {it.title}
                  </div>
                  <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>
                    {it.location || ""}
                    {it.teacher ? `｜${it.teacher}` : ""}
                  </div>
                </button>
              );
            });
        })}

      </div>
    </section>
  );
}

function CourseDrawer({
  course,
  onClose,
}: {
  course: SelectedCourse | null;
  onClose: () => void;
}) {
  if (!course) return null;

  const meta = [course.dateLabel, course.timeText].filter(Boolean).join("｜");
  const sub = [course.location, course.teacher].filter(Boolean).join("｜");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50"
      onClick={onClose}
      style={{ backgroundColor: "rgba(0,0,0,0.22)" }}
    >
      <div
        className="absolute left-0 right-0 bottom-0 px-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: `calc(16px + env(safe-area-inset-bottom))` }}
      >
        <div
          className="max-w-2xl mx-auto rounded-3xl p-4"
          style={{
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {course.title}
              </div>
              {meta ? (
                <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {meta}
                </div>
              ) : null}
              {sub ? (
                <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {sub}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] rounded-full"
              style={{
                backgroundColor: "rgba(255,122,26,0.12)",
                color: "var(--accent)",
                border: "1px solid rgba(255,122,26,0.18)",
              }}
            >
              关闭
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                const text = [course.title, sub, meta].filter(Boolean).join("\n");
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  // ignore
                }
              }}
              className="px-4 py-2 text-[13px] rounded-2xl"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              复制信息
            </button>
            <button
              type="button"
              onClick={() => {
                // placeholder for reminder integration
              }}
              className="px-4 py-2 text-[13px] rounded-2xl"
              style={{
                backgroundColor: "rgba(255,255,255,0.7)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            >
              设提醒（待接）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TimetableApp({ schedule }: { schedule: RawScheduleData }) {
  const [tab, setTab] = useState<TabKey>("today");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedCourse | null>(null);
  const [mounted, setMounted] = useState(false);
  const [reminder, setReminder] = useState<{ startAt: number; remindAt: number } | null>(null);
  const reminderTimerRef = useRef<number | null>(null);
  const todayListRef = useRef<HTMLDivElement>(null);
  const tz = schedule.meta.tz || "Asia/Shanghai";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem("zaoz8_reminder");
      if (raw) {
        const parsed = JSON.parse(raw) as { startAt: number; remindAt: number };
        if (parsed?.remindAt && parsed.remindAt > Date.now()) {
          setReminder(parsed);
        } else {
          localStorage.removeItem("zaoz8_reminder");
        }
      }
    } catch {
      // ignore
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (reminderTimerRef.current) {
      window.clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    }
    if (!reminder) return;

    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const delay = reminder.remindAt - Date.now();
    if (delay <= 0) return;

    reminderTimerRef.current = window.setTimeout(() => {
      try {
        new Notification("上早八：要上课了");
      } catch {
        // ignore
      }
      // fire once
      try {
        localStorage.removeItem("zaoz8_reminder");
      } catch {
        // ignore
      }
      setReminder(null);
    }, delay);

    return () => {
      if (reminderTimerRef.current) {
        window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = null;
      }
    };
  }, [mounted, reminder]);

  const today = useMemo(() => {
    const now = getNowInTimeZone(tz);
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [tz]);

  const todayData = useMemo(() => {
    const { weekNum, items } = getItemsForDate(schedule, today);
    const text = formatDayResponse(today, weekNum, items);
    const title = today.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
    return { title, weekNum, items, text };
  }, [schedule, today]);

  const nextCourse = useMemo(() => (mounted ? getNextCourse(schedule, today, tz) : null), [mounted, schedule, today, tz]);

  const queryResult = useMemo(() => {
    const d = parseDateInput(query);
    if (!d) return null;
    const { weekNum, items } = getItemsForDate(schedule, d);
    const text = formatDayResponse(d, weekNum, items);
    const title = d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
    return { title, weekNum, items, text };
  }, [schedule, query]);

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg-gradient)", backgroundColor: "var(--surface)" }}>
      <header
        className="sticky top-0 z-20 px-5 py-3 flex items-center justify-between"
        style={{
          backgroundColor: "var(--surface)",
          borderBottom: "0.5px solid var(--border)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div className="flex flex-col">
          <h1 className="text-[18px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>
            上早八
          </h1>
          <span className="text-[11px] mt-1" style={{ color: "var(--accent)" }}>
            早八别迟到
          </span>
        </div>
      </header>

      <div className="px-4 pt-0 max-w-2xl mx-auto w-full">
        <nav className="flex gap-2 py-3">
          {[
            { key: "today", label: "今天" },
            { key: "week", label: "本周" },
            { key: "query", label: "查询" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as TabKey)}
              className="px-3 py-1.5 text-[13px] rounded-full"
              style={
                tab === t.key
                  ? { backgroundColor: "var(--accent)", color: "#fff" }
                  : {
                      backgroundColor: "var(--surface-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 max-w-2xl mx-auto w-full space-y-3">
        {tab === "today" ? (
          <>
            <section
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg, rgba(255,122,26,0.16) 0%, rgba(255,122,26,0.05) 100%)",
                border: "1px solid rgba(255,122,26,0.28)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {!mounted ? (
                <>
                  <div className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                    正在加载
                  </div>
                  <div className="text-[22px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
                    计算下一节课中…
                  </div>
                  <div className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
                    这一步只在本机完成，不会上传数据。
                  </div>
                </>
              ) : todayData.items.length === 0 ? (
                <>
                  <div className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                    今天
                  </div>
                  <div className="text-[22px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
                    今天没有课
                  </div>
                  <div className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
                    休息一下也挺好。
                  </div>
                </>
              ) : nextCourse ? (
                <>
                  <div className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                    距离下一节课开始
                  </div>
                  <div className="text-[44px] font-bold mt-2 animate-breathe" style={{ color: "var(--text-primary)" }}>
                    <CountdownTimer targetTime={nextCourse.startTime} tz={tz} />
                  </div>
                  <div className="text-[18px] font-semibold mt-3" style={{ color: "var(--text-primary)" }}>
                    {nextCourse.item.title}
                  </div>
                  <div className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
                    {[nextCourse.item.location, nextCourse.item.kind === "course" ? nextCourse.item.teacher : "", nextCourse.item.timeText]
                      .filter(Boolean)
                      .join("｜")}
                  </div>

                  <div className="mt-4 flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => todayListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="px-4 py-2 text-[13px] rounded-2xl active:scale-95"
                      style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                    >
                      查看今日课表
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const startAt = nextCourse.startTime.getTime();
                        if (reminder?.startAt === startAt) {
                          try {
                            localStorage.removeItem("zaoz8_reminder");
                          } catch {
                            // ignore
                          }
                          setReminder(null);
                          alert("已取消提醒");
                          return;
                        }
                        const remindAt = startAt - 10 * 60 * 1000;
                        if (remindAt <= Date.now()) {
                          alert("离上课太近了，来不及设 10 分钟提醒");
                          return;
                        }
                        if (!("Notification" in window)) {
                          alert("当前浏览器不支持通知");
                          return;
                        }
                        const perm = await Notification.requestPermission();
                        if (perm !== "granted") {
                          alert("未允许通知权限，无法提醒");
                          return;
                        }
                        const payload = { startAt, remindAt };
                        try {
                          localStorage.setItem("zaoz8_reminder", JSON.stringify(payload));
                        } catch {
                          // ignore
                        }
                        setReminder(payload);
                        alert("已设置：开课前 10 分钟提醒（刷新页面也会保留）");
                      }}
                      className="px-4 py-2 text-[13px] rounded-2xl active:scale-95"
                      style={{
                        backgroundColor: "rgba(255,122,26,0.12)",
                        color: "var(--accent)",
                        border: "1px solid rgba(255,122,26,0.18)",
                      }}
                    >
                      {reminder?.startAt === nextCourse.startTime.getTime() ? "取消提醒" : "10 分钟提醒"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                    今天
                  </div>
                  <div className="text-[22px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
                    今天的课都结束啦
                  </div>
                  <div className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
                    可以准备明天的早八了。
                  </div>
                </>
              )}
            </section>

            <div ref={todayListRef} />
            <DayCard
              title={todayData.title}
              weekNum={todayData.weekNum}
              items={todayData.items}
              rawText={todayData.text}
              onSelect={(c) => setSelected(c)}
            />
          </>
        ) : null}

        {tab === "week" ? <WeekGrid schedule={schedule} baseDate={today} onSelect={(c) => setSelected(c)} /> : null}

        {tab === "query" ? (
          <section
            className="rounded-2xl p-4"
            style={{
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              输入一个日期
            </div>
            <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
              支持：今天/明天/周末/下周一/2026-03-12
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例如：今天 / 周末 / 2026-03-12"
                className="flex-1 px-4 py-[10px] text-[15px] rounded-full"
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                type="button"
                onClick={() => setQuery("")}
                className="px-4 py-[10px] text-[13px] rounded-full"
                style={{
                  backgroundColor: "rgba(255,122,26,0.12)",
                  color: "var(--accent)",
                  border: "1px solid rgba(255,122,26,0.18)",
                }}
              >
                清空
              </button>
            </div>

            <div className="mt-3">
              {query && !queryResult ? (
                <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  没识别出来，换个输入试试。
                </div>
              ) : null}

              {queryResult ? (
                <div className="mt-3">
                  <DayCard
                    title={queryResult.title}
                    weekNum={queryResult.weekNum}
                    items={queryResult.items}
                    rawText={queryResult.text}
                    onSelect={(c) => setSelected(c)}
                  />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <CourseDrawer course={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
