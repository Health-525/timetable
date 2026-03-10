"use client";
import { memo, useRef, useCallback } from "react";
import { DayItem } from "@/lib/schedule";
import { NextCourseInfo } from "@/lib/next-course";
import CountdownTimer from "./CountdownTimer";
import DayCard, { SelectedCourse } from "./DayCard";
import { formatCountdown, getNowInTimeZone } from "@/lib/timezone";
interface TodayViewProps {
  mounted: boolean;
  title: string;
  weekNum: number;
  items: DayItem[];
  rawText: string;
  nextCourse: NextCourseInfo | null;
  hasReminder: boolean;
  tz: string;
  onSelect: (course: SelectedCourse) => void;
  reminderMinutes: 5 | 10 | 15;
  onReminderMinutesChange: (m: 5 | 10 | 15) => void;
  onToggleReminder: (m: 5 | 10 | 15) => void;
}
/**
 * 今天页面组件
 */
function TodayView({
  mounted,
  title,
  weekNum,
  items,
  rawText,
  nextCourse,
  hasReminder,
  tz,
  onSelect,
  reminderMinutes,
  onReminderMinutesChange,
  onToggleReminder,
}: TodayViewProps) {
  const todayListRef = useRef<HTMLDivElement>(null);
  const scrollToList = useCallback(() => {
    todayListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const renderHeroContent = () => {
    if (!mounted) {
      return (
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
      );
    }
    if (items.length === 0) {
      return (
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
      );
    }
    if (nextCourse) {
      const sub = [
        nextCourse.item.location,
        nextCourse.item.kind === "course" ? nextCourse.item.teacher : "",
        nextCourse.item.timeText,
      ]
        .filter(Boolean)
        .join("｜");
      return (
        <>
          {(() => {
            const now = getNowInTimeZone(tz).getTime();
            const started = nextCourse.startTime.getTime() <= now;
            const toEnd = nextCourse.endTime.getTime() - now;

            return (
              <>
                <div className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                  {started ? "已开始 · 还能上" : "距离下一节课开始"}
                </div>

                {started ? (
                  <div className="text-[30px] sm:text-[36px] font-bold mt-2" style={{ color: "var(--text-primary)" }}>
                    距离下课 {formatCountdown(toEnd)}
                  </div>
                ) : (
                  <div
                    className="text-[36px] sm:text-[44px] font-bold mt-2 animate-breathe"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <CountdownTimer targetTime={nextCourse.startTime} tz={tz} />
                  </div>
                )}
              </>
            );
          })()}
          <div className="text-[16px] sm:text-[18px] font-semibold mt-3" style={{ color: "var(--text-primary)" }}>
            {nextCourse.item.title}
          </div>
          {sub && (
            <div className="text-[12px] sm:text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
              {sub}
            </div>
          )}
          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={scrollToList}
              className="px-4 py-2.5 text-[13px] rounded-2xl active:scale-95 transition-transform"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              查看今日课表
            </button>
            <div className="flex items-center gap-1.5">
              {[5, 10, 15].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onReminderMinutesChange(m as 5 | 10 | 15)}
                  className="px-2.5 py-2.5 text-[12px] rounded-2xl active:scale-95 transition-transform"
                  style={
                    reminderMinutes === m
                      ? { backgroundColor: "var(--accent)", color: "#fff" }
                      : {
                          backgroundColor: "rgba(255,122,26,0.08)",
                          color: "var(--text-secondary)",
                          border: "1px solid rgba(255,122,26,0.12)",
                        }
                  }
                >
                  {m}分
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onToggleReminder(reminderMinutes)}
              className="px-4 py-2.5 text-[13px] rounded-2xl active:scale-95 transition-transform"
              style={{
                backgroundColor: hasReminder ? "rgba(255,59,48,0.12)" : "rgba(255,122,26,0.12)",
                color: hasReminder ? "#ff3b30" : "var(--accent)",
                border: hasReminder ? "1px solid rgba(255,59,48,0.18)" : "1px solid rgba(255,122,26,0.18)",
              }}
            >
              {hasReminder ? "取消提醒" : `${reminderMinutes} 分钟提醒`}
            </button>
          </div>
        </>
      );
    }
    return (
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
    );
  };
  return (
    <>
      <section
        className="rounded-2xl p-4 sm:p-5"
        style={{
          background: "linear-gradient(135deg, rgba(255,122,26,0.16) 0%, rgba(255,122,26,0.05) 100%)",
          border: "1px solid rgba(255,122,26,0.28)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {renderHeroContent()}
      </section>
      <div ref={todayListRef} />
      <DayCard
        title={title}
        weekNum={weekNum}
        items={items}
        rawText={rawText}
        onSelect={onSelect}
        highlightTitle={nextCourse?.item.title}
      />
    </>
  );
}
export default memo(TodayView);