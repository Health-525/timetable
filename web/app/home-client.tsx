"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DayItem,
  RawScheduleData,
  formatDayResponse,
  getItemsForDate,
  parseSchedule,
} from "@/lib/schedule";
import { parseDateInput } from "@/lib/date-parser";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: DayItem[];
  dateStr?: string;
  weekNum?: number;
}

const DEFAULT_SCHEDULE_URL =
  "https://raw.githubusercontent.com/Health-525/timetable/main/data/schedule.json";

const quickChips = [
  { label: "Today", value: "today" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "Mon", value: "周一" },
  { label: "Tue", value: "周二" },
  { label: "Wed", value: "周三" },
  { label: "Thu", value: "周四" },
  { label: "Fri", value: "周五" },
  { label: "Sat", value: "周六" },
  { label: "Sun", value: "周日" },
] as const;

function WelcomeBubble() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[var(--message-assistant)] text-[var(--message-assistant-text)] px-4 py-3 text-sm leading-relaxed">
        <p className="font-semibold mb-1">Table Time</p>
        <p className="opacity-80">你可以这样问：</p>
        <ul className="mt-1 space-y-0.5 opacity-80">
          <li>today / 今天</li>
          <li>明天</li>
          <li>周一/周二/…</li>
          <li>2026-03-12</li>
        </ul>
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-[var(--message-assistant)] rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1.5">
          <span
            className="w-2 h-2 rounded-full bg-[var(--text-secondary)]/60 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-[var(--text-secondary)]/60 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-[var(--text-secondary)]/60 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

export default function HomeClient() {
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "welcome",
    },
  ]);
  const [input, setInput] = useState("");
  const [schedule, setSchedule] = useState<RawScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scheduleUrl = process.env.NEXT_PUBLIC_SCHEDULE_URL || DEFAULT_SCHEDULE_URL;

  useEffect(() => {
    fetch(scheduleUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setSchedule(parseSchedule(data)))
      .catch((err) => {
        console.error(err);
        setMessages((prev) => [
          ...prev,
          {
            id: "load-error",
            role: "assistant",
            content:
              "无法加载课表数据。\n请检查网络或 NEXT_PUBLIC_SCHEDULE_URL 配置。",
          },
        ]);
      });
  }, [scheduleUrl]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const copyLocation = useCallback((location: string, id: string) => {
    navigator.clipboard
      .writeText(location)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1200);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const runQuery = useCallback(
    (text: string) => {
      if (!schedule) return;

      const targetDate = parseDateInput(text);
      if (!targetDate) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-a`,
            role: "assistant",
            content: "我没理解这个日期。试试：today、明天、周一、YYYY-MM-DD。",
          },
        ]);
        return;
      }

      const result = getItemsForDate(schedule, targetDate);
      const answer = formatDayResponse(targetDate, result.weekNum, result.items);

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: answer,
          cards: result.items,
          dateStr: targetDate.toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          }),
          weekNum: result.weekNum,
        },
      ]);
    },
    [schedule]
  );

  // Auto-run: /?q=...
  useEffect(() => {
    if (!schedule || autoRan) return;
    const q = (searchParams.get("q") || "").trim();
    if (!q) return;

    setAutoRan(true);
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", content: q },
    ]);
    setLoading(true);
    setTimeout(() => {
      runQuery(q);
      setLoading(false);
    }, 200);
  }, [schedule, autoRan, searchParams, runQuery]);

  function onChip(value: string) {
    if (!schedule || loading) return;
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", content: value },
    ]);
    setLoading(true);
    setTimeout(() => {
      runQuery(value);
      setLoading(false);
    }, 200);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schedule || loading) return;
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", content: text },
    ]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      runQuery(text);
      setLoading(false);
    }, 200);
  }

  function Cards({ msg }: { msg: Message }) {
    if (!msg.cards) return null;

    if (msg.cards.length === 0) {
      return (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          今天没有课
        </div>
      );
    }

    return (
      <div className="mt-3 flex flex-col gap-2 rounded-xl bg-black/[0.03] p-2">
        {msg.cards.map((item, idx) => {
          const id = `${msg.id}-${idx}`;
          const isCopied = copiedId === id;
          const chipClass =
            item.kind === "special"
              ? "bg-orange-500/10 text-orange-600"
              : "bg-blue-500/10 text-blue-600";

          return (
            <div
              key={id}
              className="rounded-lg border border-black/[0.06] bg-white/70 px-3 py-3 transition-colors hover:bg-white"
              role={item.location ? "button" : undefined}
              tabIndex={item.location ? 0 : undefined}
              onClick={() => item.location && copyLocation(item.location, id)}
              title={item.location ? "点击复制地点" : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${chipClass}`}>
                  {item.kind === "special"
                    ? item.timeText
                    : `第${item.periods.join("-")}节`}
                </span>
                {item.kind === "course" && item.timeText && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {item.timeText}
                  </span>
                )}
              </div>

              <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                {item.title}
              </div>

              {item.location && (
                <div className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  {isCopied ? "Copied" : item.location}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <div className="text-base font-semibold">Table Time</div>
          <Link
            href="/about"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            About
          </Link>
        </div>
      </header>

      <div className="sticky top-14 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {quickChips.map((c) => (
              <button
                key={c.value}
                onClick={() => onChip(c.value)}
                disabled={loading || !schedule}
                className="whitespace-nowrap rounded-full border border-black/[0.06] bg-black/[0.03] px-3 py-1.5 text-sm font-medium hover:bg-black/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
          {messages.map((msg) => {
            if (msg.id === "welcome") {
              return <WelcomeBubble key={msg.id} />;
            }

            const isUser = msg.role === "user";
            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "rounded-br-md bg-[var(--message-user)] text-[var(--message-user-text)]"
                      : "rounded-bl-md bg-[var(--message-assistant)] text-[var(--message-assistant-text)]"
                  }`}
                >
                  {msg.role === "assistant" && msg.cards ? (
                    <>
                      <div className="text-sm font-medium opacity-90">
                        {msg.dateStr}（第{msg.weekNum}周）
                      </div>
                      <Cards msg={msg} />
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            );
          })}

          {loading && <LoadingBubble />}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 z-50 border-t border-[var(--border)] bg-[var(--background)]/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a date…"
              className="flex-1 min-h-[44px] rounded-xl border border-[var(--border)] bg-white/70 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              disabled={loading || !schedule}
            />
            <button
              type="submit"
              disabled={loading || !schedule || !input.trim()}
              className="min-h-[44px] rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
          <div className="mt-2 text-center text-xs text-[var(--text-secondary)]/70">
            {schedule ? "Data loaded" : "Loading data…"}
          </div>
        </div>
      </footer>
    </div>
  );
}
