"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  formatDayResponse,
  getItemsForDate,
  RawScheduleData,
} from "@/lib/schedule";
import { parseDateInput } from "@/lib/date-parser";

type DayMessageData = {
  dateIso: string;
  weekNum: number;
  items: ReturnType<typeof getItemsForDate>["items"];
  text: string;
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind?: "text" | "day";
  day?: DayMessageData;
}

function getNowInTimeZone(tz: string) {
  // Best-effort: construct a Date in the target timezone by round-tripping through locale string.
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}

function TodayOverview({
  schedule,
  onQuickQuery,
}: {
  schedule: RawScheduleData;
  onQuickQuery: (q: string) => void;
}) {
  const tz = schedule.meta.tz || "Asia/Shanghai";
  const now = getNowInTimeZone(tz);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const { weekNum, items } = getItemsForDate(schedule, today);

  const next = (() => {
    // pick first item whose start time is after now
    for (const it of items) {
      const start = it.kind === "special" ? it.timeText.split("-")[0] : (it.timeText || "").split("-")[0];
      if (!start) continue;
      const [hh, mm] = start.split(":").map((n) => Number(n));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      const t = new Date(now);
      t.setHours(hh, mm, 0, 0);
      if (t.getTime() > now.getTime()) return it;
    }
    return null;
  })();

  return (
    <section
      className="rounded-2xl p-4 mb-3"
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            今天（第{weekNum}周）
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {today.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onQuickQuery("今天")}
            className="px-3 py-1.5 text-[13px] rounded-full"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            查询今天
          </button>
          <button
            type="button"
            onClick={() => onQuickQuery("明天")}
            className="px-3 py-1.5 text-[13px] rounded-full"
            style={{ backgroundColor: "rgba(255,122,26,0.12)", color: "var(--accent)", border: "1px solid rgba(255,122,26,0.18)" }}
          >
            明天
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
          下一节课
        </div>
        <div className="mt-1 text-[13px]" style={{ color: "var(--text-primary)" }}>
          {next
            ? `${next.kind === "special" ? next.timeText : next.timeText || ""}｜${next.title}${next.location ? `｜${next.location}` : ""}`
            : items.length
              ? "今天的课上完啦"
              : "今天没有课"}
        </div>
      </div>
    </section>
  );
}

function DayCards({ day }: { day: DayMessageData }) {
  const date = new Date(day.dateIso);
  const title = date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div
      className="max-w-[92%]"
      style={{
        padding: "12px 14px",
        borderRadius: "18px",
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}（第{day.weekNum}周）
      </div>

      {!day.items.length ? (
        <div className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
          今天没有课
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {day.items.map((it, idx) => {
            const timeText = it.kind === "special" ? it.timeText : it.timeText || "";
            const sub = [
              it.kind === "course"
                ? `第${(it.periods?.[0] ?? "?")}${it.periods?.length ? `-${it.periods[it.periods.length - 1]}` : ""}节`
                : "活动",
              it.location || "",
            ]
              .filter(Boolean)
              .join("｜");

            return (
              <div
                key={idx}
                className="rounded-2xl px-3 py-2"
                style={{
                  backgroundColor: "rgba(255,122,26,0.08)",
                  border: "1px solid rgba(255,122,26,0.14)",
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
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          共 {day.items.length} 项
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(day.text);
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
          复制文本
        </button>
      </div>
    </div>
  );
}

export default function ChatClient({
  schedule,
  initialQuery,
}: {
  schedule: RawScheduleData;
  initialQuery?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const [lastResolved, setLastResolved] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-run for demo/screenshots: /?q=today|明天|2026-03-12
  useEffect(() => {
    if (autoRan) return;
    const q = (initialQuery || "").trim();
    if (!q) return;

    setAutoRan(true);
    setLoading(true);

    const targetDate = parseDateInput(q);
    const userMsg: Message = { id: `${Date.now()}-q`, role: "user", content: q };

    if (!targetDate) {
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `${Date.now()}-qa`,
          role: "assistant",
          content: "我没理解这个日期。试试：today、明天、周一、YYYY-MM-DD（如 2026-03-12）。",
        },
      ]);
      setLoading(false);
      return;
    }

    const { weekNum, items } = getItemsForDate(schedule, targetDate);
    const answer = formatDayResponse(targetDate, weekNum, items);

    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: `${Date.now()}-qa`,
        role: "assistant",
        content: answer,
        kind: "day",
        day: {
          dateIso: targetDate.toISOString(),
          weekNum,
          items,
          text: answer,
        },
      },
    ]);

    setLoading(false);
  }, [schedule, autoRan, initialQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function runQuery(text: string) {
    const t = text.trim();
    if (!t || loading) return;

    setMessages((prev) => [...prev, { id: `${Date.now()}-u`, role: "user", content: t }]);
    setLoading(true);

    // Simulate thinking for UX
    setTimeout(() => {
      const targetDate = parseDateInput(t);

      if (!targetDate) {
        setLastResolved(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-a`,
            role: "assistant",
            content:
              "我没理解这个日期。\n\n试试：today、明天、周一、周末、下周一、YYYY-MM-DD（如 2026-03-12）。",
          },
        ]);
        setLoading(false);
        return;
      }

      setLastResolved(
        targetDate.toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
        })
      );

      const { weekNum, items } = getItemsForDate(schedule, targetDate);
      const answer = formatDayResponse(targetDate, weekNum, items);

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: answer,
          kind: "day",
          day: {
            dateIso: targetDate.toISOString(),
            weekNum,
            items,
            text: answer,
          },
        },
      ]);
      setLoading(false);
    }, 250);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    runQuery(text);
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-gradient)", backgroundColor: "var(--surface)" }}
    >
      {/* Header - iOS Style */}
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
          <h1
            className="text-[17px] font-semibold tracking-[-0.01em] leading-none"
            style={{ color: "var(--text-primary)" }}
          >
            Table Time
          </h1>
          <span className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            课表助手
          </span>
        </div>
        <Link
          href="/about"
          className="text-[15px] font-normal transition-colors duration-200 hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          About
        </Link>
      </header>

      <div className="px-4 pt-0 max-w-2xl mx-auto w-full space-y-3">
        <section
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            课表助手
          </div>
          <div className="text-[13px] mt-2 whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
            {"你可以这样问：\n- today / 今天\n- 明天\n- 周末\n- 下周 / 下周一\n- YYYY-MM-DD（如 2026-03-12）"}
          </div>
        </section>
        <TodayOverview schedule={schedule} onQuickQuery={runQuery} />
      </div>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-2xl mx-auto w-full"
        style={{ paddingBottom: "calc(var(--space-6) + 80px)" }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            {msg.role === "assistant" && msg.kind === "day" && msg.day ? (
              <DayCards day={msg.day} />
            ) : (
              <div
                className="max-w-[80%] text-[15px] leading-[1.35] whitespace-pre-line"
                style={{
                  padding: "10px 14px",
                  borderRadius:
                    msg.role === "user" ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
                  backgroundColor:
                    msg.role === "user" ? "var(--message-user)" : "var(--message-assistant)",
                  color:
                    msg.role === "user"
                      ? "var(--message-user-text)"
                      : "var(--message-assistant-text)",
                  boxShadow: "var(--shadow-sm)",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                }}
              >
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "20px 20px 20px 6px",
                backgroundColor: "var(--message-assistant)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className="flex space-x-[6px]" aria-label="loading">
                <div
                  className="w-[8px] h-[8px] rounded-full animate-bounce"
                  style={{
                    animationDelay: "0ms",
                    backgroundColor: "var(--text-secondary)",
                  }}
                />
                <div
                  className="w-[8px] h-[8px] rounded-full animate-bounce"
                  style={{
                    animationDelay: "150ms",
                    backgroundColor: "var(--text-secondary)",
                  }}
                />
                <div
                  className="w-[8px] h-[8px] rounded-full animate-bounce"
                  style={{
                    animationDelay: "300ms",
                    backgroundColor: "var(--text-secondary)",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed Bottom with Frosted Glass */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-4"
        style={{
          paddingTop: "var(--space-3)",
          paddingBottom: `calc(var(--space-3) + env(safe-area-inset-bottom))`,
          backgroundColor: "var(--surface)",
          borderTop: "0.5px solid var(--border)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div className="max-w-2xl mx-auto flex gap-2 pb-2 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {[
            { label: "今天", value: "今天" },
            { label: "明天", value: "明天" },
            { label: "周末", value: "周末" },
            { label: "下周", value: "下周" },
            { label: "下周一", value: "下周一" },
          ].map((it) => (
            <button
              key={it.label}
              type="button"
              disabled={loading}
              onClick={() => runQuery(it.value)}
              className="px-3 py-1.5 text-[13px] rounded-full transition-opacity disabled:opacity-40"
              style={{
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            >
              {it.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a date: today / 明天 / 2026-03-12"
            className="flex-1 px-4 py-[10px] text-[15px] rounded-full transition-all duration-200"
            style={{
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-[10px] text-[15px] font-medium rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              backgroundColor: "var(--accent)",
              color: "#ffffff",
            }}
          >
            Send
          </button>
        </form>
        <p className="text-center text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
          数据源：已加载（可用 NEXT_PUBLIC_SCHEDULE_URL 覆盖）
          {lastResolved ? `｜已解析为：${lastResolved}` : ""}
        </p>
      </div>
    </main>
  );
}
