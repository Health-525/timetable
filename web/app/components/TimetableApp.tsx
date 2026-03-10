"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { RawScheduleData, formatDayResponse } from "@/lib/schedule";
import { getNowInTimeZone, normalizeDate } from "@/lib/timezone";
import { getNextCourse } from "@/lib/next-course";
import { Adjustment, loadAdjustments, getAdjustedItemsForDate } from "@/lib/adjustments";
import {
  loadReminder,
  saveReminder,
  clearReminder,
  checkNotificationPermission,
  sendNotification,
} from "@/lib/reminder";
import TodayView from "./TodayView";
import WeekGrid from "./WeekGrid";
import QueryView from "./QueryView";
import CourseDrawer from "./CourseDrawer";
import type { SelectedCourse } from "./DayCard";

type TabKey = "today" | "week" | "query";

const TABS = [
  { key: "today" as const, label: "今天" },
  { key: "week" as const, label: "本周" },
  { key: "query" as const, label: "查询" },
];

export default function TimetableApp({ schedule }: { schedule: RawScheduleData }) {
  const [tab, setTab] = useState<TabKey>("today");
  const [query, setQuery] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<5 | 10 | 15>(10);
  const [selected, setSelected] = useState<SelectedCourse | null>(null);
  const [mounted, setMounted] = useState(false);
  const [reminder, setReminder] = useState<{ startAt: number; remindAt: number } | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const reminderTimerRef = useRef<number | null>(null);
  const tz = schedule.meta.tz || "Asia/Shanghai";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const saved = loadReminder();
    if (saved) setReminder({ startAt: saved.startAt, remindAt: saved.remindAt });
  }, [mounted]);

  // 加载调课记录
  useEffect(() => {
    setAdjustments(loadAdjustments());
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (reminderTimerRef.current) {
      window.clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    }
    if (!reminder) return;
    if (!checkNotificationPermission()) return;

    const delay = reminder.remindAt - Date.now();
    if (delay <= 0) return;

    reminderTimerRef.current = window.setTimeout(() => {
      sendNotification("上早八：要上课了");
      clearReminder();
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
    return normalizeDate(now);
  }, [tz]);

  const todayData = useMemo(() => {
    const { weekNum, items } = getAdjustedItemsForDate(schedule, today, adjustments);
    const text = formatDayResponse(today, weekNum, items);
    const title = today.toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    return { title, weekNum, items, text };
  }, [schedule, today, adjustments]);

  const nextCourse = useMemo(() => {
    if (!mounted) return null;
    return getNextCourse(schedule, today, tz);
  }, [mounted, schedule, today, tz]);

  const hasReminder = useMemo(() => {
    if (!nextCourse || !reminder) return false;
    return reminder.startAt === nextCourse.startTime.getTime();
  }, [nextCourse, reminder]);

  const handleToggleReminder = useCallback(async (minutes: number) => {
    if (!nextCourse) return;

    const startAt = nextCourse.startTime.getTime();

    if (reminder?.startAt === startAt) {
      clearReminder();
      setReminder(null);
      alert("已取消提醒");
      return;
    }

    const remindAt = startAt - minutes * 60 * 1000;
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
    saveReminder(payload);
    setReminder(payload);
    alert(`已设置：开课前 ${minutes} 分钟提醒（刷新页面也会保留）`);
  }, [nextCourse, reminder]);

  const onToggleReminder = useCallback((m: 5 | 10 | 15) => handleToggleReminder(m), [handleToggleReminder]);

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-gradient)", backgroundColor: "var(--surface)" }}
    >
      <header
        className="sticky top-0 z-20 px-4 sm:px-5 py-3 flex items-center justify-between"
        style={{
          backgroundColor: "var(--surface)",
          borderBottom: "0.5px solid var(--border)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="shrink-0 rounded-xl overflow-hidden"
            style={{
              width: 28,
              height: 28,
              boxShadow: "var(--shadow-sm)",
              border: "1px solid var(--border)",
              backgroundColor: "rgba(255,255,255,0.8)",
            }}
          >
            <Image src="/icon-192.png" alt="上早八" width={28} height={28} priority />
          </div>
          <div className="flex flex-col">
            <h1 className="text-[18px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>
              上早八
            </h1>
            <span className="text-[11px] mt-1" style={{ color: "var(--accent)" }}>
              早八别迟到
            </span>
          </div>
        </div>
      </header>

      <div className="px-4 pt-0 max-w-2xl mx-auto w-full">
        <nav className="flex gap-2 py-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="px-4 py-2 text-[13px] rounded-full active:scale-95 transition-all"
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
        {tab === "today" && (
          <TodayView
            mounted={mounted}
            title={todayData.title}
            weekNum={todayData.weekNum}
            items={todayData.items}
            rawText={todayData.text}
            nextCourse={nextCourse}
            hasReminder={hasReminder}
            tz={tz}
            onSelect={setSelected}
            reminderMinutes={reminderMinutes}
            onReminderMinutesChange={setReminderMinutes}
            onToggleReminder={onToggleReminder}
          />
        )}

        {tab === "week" && <WeekGrid schedule={schedule} baseDate={today} onSelect={setSelected} adjustments={adjustments} />}

        {tab === "query" && (
          <QueryView query={query} onQueryChange={setQuery} schedule={schedule} onSelect={setSelected} />
        )}
      </div>

      <CourseDrawer course={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
