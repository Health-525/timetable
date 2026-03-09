"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DayItem, RawScheduleData, formatDayResponse, getItemsForDate, parseSchedule } from "@/lib/schedule";
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

export default function HomeClient() {
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好，我是课表助手。\n\n你可以这样问：\n- today / 今天\n- 明天\n- 周一/周二/…\n- 2026-03-12",
    },
  ]);
  const [input, setInput] = useState("");
  const [schedule, setSchedule] = useState<RawScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1200);
  }, []);

  const copyLocation = useCallback(
    (location: string, id: string) => {
      navigator.clipboard
        .writeText(location)
        .then(() => {
          setCopiedId(id);
          showToast("地点已复制");
          setTimeout(() => setCopiedId(null), 1200);
        })
        .catch(() => {
          // ignore
        });
    },
    [showToast]
  );

  const runQuery = useMemo(
    () =>
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
    setActiveChip(value);
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

  function onSubmit() {
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

    // reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  function Cards({ msg }: { msg: Message }) {
    if (!msg.cards) return null;

    if (msg.cards.length === 0) {
      return (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--text-muted)]">
          今天没有课
        </div>
      );
    }

    return (
      <div className="mt-3 flex flex-col gap-2">
        {msg.cards.map((item, idx) => {
          const id = `${msg.id}-${idx}`;
          const copied = copiedId === id;

          const badge =
            item.kind === "special"
              ? "bg-orange-500/10 text-orange-700"
              : "bg-blue-500/10 text-blue-700";

          return (
            <div
              key={id}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}`}>
                  {item.kind === "special"
                    ? item.timeText
                    : `第${item.periods.join("-")}节`}
                </span>
                {item.kind === "course" && item.timeText && (
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">
                    {item.timeText}
                  </span>
                )}
              </div>

              <div className="mt-1.5 text-[15px] font-semibold text-[var(--text-primary)]">
                {item.title}
              </div>

              {item.location && (
                <button
                  type="button"
                  className="mt-1.5 inline-flex items-center gap-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  onClick={() => copyLocation(item.location!, id)}
                  aria-label={`复制地点 ${item.location}`}
                >
                  <span className="tabular-nums">
                    {copied ? "已复制" : item.location}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface)] text-[var(--foreground)]">
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <div className="text-[15px] font-semibold tracking-tight">Table Time</div>
          <Link
            href="/about"
            className="text-[14px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            About
          </Link>
        </div>
      </header>

      <div className="sticky top-14 z-40 border-b border-[var(--border)] bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {quickChips.map((c) => {
              const active = activeChip === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => onChip(c.value)}
                  disabled={loading || !schedule}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? "bg-[var(--accent)] text-white border-transparent"
                      : "bg-white text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--muted)]"
                  }`}
                  aria-pressed={active}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[95%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                    isUser
                      ? "rounded-br-md bg-[var(--message-user)] text-[var(--message-user-text)]"
                      : "rounded-bl-md bg-white border border-[var(--border)] text-[var(--text-primary)]"
                  }`}
                >
                  {msg.role === "assistant" && msg.cards ? (
                    <>
                      <div className="text-[14px] font-medium text-[var(--text-muted)] mb-2">
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

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-white border border-[var(--border)] px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 z-50 border-t border-[var(--border)] bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={onTextareaKeyDown}
              placeholder="输入日期查询..."
              rows={1}
              className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              disabled={loading || !schedule}
            />
            <button
              type="submit"
              disabled={loading || !schedule || !input.trim()}
              className="h-[44px] rounded-xl bg-[var(--accent)] px-4 text-[14px] font-semibold text-white hover:opacity-95 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              发送
            </button>
          </form>

          <div className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
            {schedule ? "数据已加载" : "加载中..."}
          </div>
        </div>
      </footer>

      {toast && (
        <div className="fixed left-1/2 bottom-24 -translate-x-1/2 z-[60] rounded-full bg-black text-white px-3 py-1.5 text-[13px] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
