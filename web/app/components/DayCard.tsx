"use client";
import { memo, useCallback } from "react";
import { DayItem } from "@/lib/schedule";
import { courseColor } from "@/lib/course-color";
export interface SelectedCourse {
  title: string;
  location?: string;
  teacher?: string;
  timeText?: string;
  periods?: number[];
  dateLabel?: string;
}
interface DayCardProps {
  title: string;
  weekNum: number;
  items: DayItem[];
  rawText: string;
  onSelect?: (course: SelectedCourse) => void;
  highlightTitle?: string;
}
/**
 * 单日课程卡片组件
 */
function DayCard({ title, weekNum, items, rawText, onSelect, highlightTitle }: DayCardProps) {
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawText);
    } catch {
      // 忽略复制错误
    }
  }, [rawText]);
  const handleSelect = useCallback((item: DayItem) => {
    if (item.kind === "course" && onSelect) {
      onSelect({
        title: item.title,
        location: item.location,
        teacher: item.teacher,
        timeText: item.timeText,
        periods: item.periods,
        dateLabel: title,
      });
    }
  }, [onSelect, title]);
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
          onClick={handleCopy}
          className="px-3 py-1.5 text-[12px] rounded-full active:scale-95 transition-transform"
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
          {items.map((item, idx) => (
            <CourseItem
              key={`${item.title}-${idx}`}
              item={item}
              onSelect={handleSelect}
              highlight={!!highlightTitle && item.kind === "course" && item.title === highlightTitle}
            />
          ))}
        </div>
      )}
    </section>
  );
}
interface CourseItemProps {
  item: DayItem;
  onSelect: (item: DayItem) => void;
  highlight?: boolean;
}
function CourseItem({ item, onSelect, highlight }: CourseItemProps) {
  const timeText = item.kind === "special" ? item.timeText : item.timeText || "";
  const sub = [
    item.location || "",
    item.kind === "course" && item.teacher ? item.teacher : "",
    item.kind === "course" ? `第${item.periods?.[0] ?? "?"}节起` : "",
  ]
    .filter(Boolean)
    .join("｜");
  
  const c = item.kind === "course" ? courseColor(item.title) : null;
  const isClickable = item.kind === "course";
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      disabled={!isClickable}
      className={`w-full rounded-2xl px-3 py-2.5 text-left transition-all ${
        isClickable ? "active:scale-[0.99] hover:opacity-90" : "cursor-default"
      }`}
      style={{
        backgroundColor: c ? c.bg : "rgba(255,122,26,0.08)",
        border: highlight
          ? "2px solid rgba(255,122,26,0.55)"
          : c
            ? `1px solid ${c.border}`
            : "1px solid rgba(255,122,26,0.14)",
        boxShadow: highlight ? "0 10px 26px rgba(255,122,26,0.18)" : undefined,
        opacity: isClickable ? 1 : 0.85,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {item.title}
        </div>
        <div className="text-[12px] shrink-0" style={{ color: "var(--accent)" }}>
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
}
export default memo(DayCard);
export type { SelectedCourse };