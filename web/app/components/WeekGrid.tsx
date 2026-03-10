"use client";
import { memo, useCallback, useMemo, useRef } from "react";
import { RawScheduleData, weekday1to7 } from "@/lib/schedule";
import { courseColor } from "@/lib/course-color";
import { Adjustment, getAdjustedItemsForDate } from "@/lib/adjustments";
import type { SelectedCourse } from "./DayCard";
interface WeekGridProps {
  schedule: RawScheduleData;
  baseDate: Date;
  onSelect?: (course: SelectedCourse) => void;
  adjustments?: Adjustment[];
}
const dayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
/**
 * 本周课表网格组件 - 移动端优化
 */
function WeekGrid({ schedule, baseDate, onSelect, adjustments = [] }: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const w = weekday1to7(baseDate);
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - (w - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const { weekNum, items } = getAdjustedItemsForDate(schedule, d, adjustments);
      return { date: d, weekNum, items };
    });
  }, [schedule, baseDate, adjustments]);
  const weekNum = days[0]?.weekNum ?? "?";
  const handleExportICS = useCallback(async () => {
    const { buildWeekICS } = await import("@/lib/ics");
    const ics = buildWeekICS(schedule, baseDate);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `上早八-第${weekNum}周.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [schedule, baseDate, weekNum]);
  return (
    <section
      className="rounded-2xl p-3 overflow-hidden"
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between gap-3 px-2 pb-3">
        <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          本周课表（第{weekNum}周）
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              // Scroll to make today's column visible (roughly)
              const idx = ((baseDate.getDay() + 6) % 7); // 0..6 Mon..Sun
              const cell = 88; // rough width per day column
              scrollRef.current?.scrollTo({ left: idx * cell, behavior: "smooth" });
            }}
            className="px-3 py-1.5 text-[12px] rounded-full active:scale-95 transition-transform"
            style={{
              backgroundColor: "rgba(255,122,26,0.08)",
              color: "var(--text-secondary)",
              border: "1px solid rgba(255,122,26,0.12)",
            }}
          >
            定位今天
          </button>
          <button
            type="button"
            onClick={handleExportICS}
            className="px-3 py-1.5 text-[12px] rounded-full active:scale-95 transition-transform"
            style={{
              backgroundColor: "rgba(255,122,26,0.12)",
              color: "var(--accent)",
              border: "1px solid rgba(255,122,26,0.18)",
            }}
          >
            导出日历
          </button>
        </div>
      </div>
      {/* 移动端：水平滚动表格 */}
      <div ref={scrollRef} className="overflow-x-auto -mx-3 px-3 pb-2">
        <div
          className="grid gap-1.5 min-w-[600px]"
          style={{
            gridTemplateColumns: "44px repeat(7, minmax(72px, 1fr))",
            gridTemplateRows: "32px repeat(10, minmax(48px, auto))",
          }}
        >
          {/* 左上角空白 */}
          <div />
          {/* 星期标题 */}
          {days.map((d, i) => (
            <div
              key={i}
              className="text-[11px] flex flex-col items-center justify-center rounded-lg py-1"
              style={{
                backgroundColor: "rgba(255,122,26,0.08)",
                border: "1px solid rgba(255,122,26,0.12)",
                color: "var(--text-primary)",
              }}
            >
              <span>{dayLabels[i]}</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {d.date.getMonth() + 1}/{d.date.getDate()}
              </span>
            </div>
          ))}
          {/* 节次标签 */}
          {Array.from({ length: 10 }, (_, idx) => (
            <div
              key={idx}
              className="text-[11px] flex items-center justify-center rounded-lg"
              style={{
                backgroundColor: "rgba(255,122,26,0.06)",
                border: "1px solid rgba(255,122,26,0.10)",
                color: "var(--text-secondary)",
              }}
            >
              {idx + 1}
            </div>
          ))}
          {/* 背景网格 */}
          {Array.from({ length: 10 * 7 }, (_, i) => (
            <div
              key={i}
              className="rounded-lg"
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                border: "1px dashed rgba(201,178,168,0.22)",
              }}
            />
          ))}
          {/* 课程块 */}
          {days.flatMap((d, dayIdx) =>
            d.items
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
                    title={`${it.title}${it.location ? `｜${it.location}` : ""}${it.teacher ? `｜${it.teacher}` : ""}`}
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
                    className="rounded-xl px-1.5 py-1 overflow-hidden text-left transition-transform active:scale-[0.99]"
                    style={{
                      gridColumn: `${dayIdx + 2} / span 1`,
                      gridRow: `${start + 1} / ${end + 2}`,
                      backgroundColor: bg,
                      border: `1px solid ${border}`,
                      zIndex: 2,
                    }}
                  >
                    <div 
                      className="text-[11px] font-semibold leading-tight line-clamp-2" 
                      style={{ color: "var(--text-primary)" }}
                    >
                      {it.title}
                    </div>
                    <div 
                      className="text-[10px] mt-0.5 leading-tight line-clamp-1" 
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {it.location || ""}
                    </div>
                  </button>
                );
              })
          )}
        </div>
      </div>
    </section>
  );
}
export default memo(WeekGrid);
