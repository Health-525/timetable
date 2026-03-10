"use client";

import { memo, useCallback } from "react";
import type { SelectedCourse } from "./DayCard";

interface CourseDrawerProps {
  course: SelectedCourse | null;
  onClose: () => void;
}

/**
 * 课程详情抽屉组件
 */
function CourseDrawer({ course, onClose }: CourseDrawerProps) {
  const handleCopy = useCallback(async () => {
    if (!course) return;
    const meta = [course.dateLabel, course.timeText].filter(Boolean).join("｜");
    const sub = [course.location, course.teacher].filter(Boolean).join("｜");
    const text = [course.title, sub, meta].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 忽略复制错误
    }
  }, [course]);

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
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
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
              className="px-3 py-1.5 text-[12px] rounded-full shrink-0"
              style={{
                backgroundColor: "rgba(255,122,26,0.12)",
                color: "var(--accent)",
                border: "1px solid rgba(255,122,26,0.18)",
              }}
            >
              关闭
            </button>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleCopy}
              className="w-full px-4 py-3 text-[13px] rounded-2xl active:scale-95 transition-transform"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              复制信息
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(CourseDrawer);