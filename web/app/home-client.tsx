"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseSchedule, getItemsForDate, formatDayResponse, RawScheduleData, DayItem } from "@/lib/schedule";
import { parseDateInput } from "@/lib/date-parser";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  // 新增：卡片数据（解析成功时使用）
  cards?: DayItem[];
  dateStr?: string;
  weekNum?: number;
}

export default function HomeClient() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好！我是课表助手。\n\n你可以这样问：\n- today / 今天\n- 明天\n- 周一/周二/...\n- 2026-03-12（YYYY-MM-DD）",
    },
  ]);
  const [input, setInput] = useState("");
  const [schedule, setSchedule] = useState<RawScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 快捷 chips 配置
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
  ];

  const scheduleUrl =
    process.env.NEXT_PUBLIC_SCHEDULE_URL ||
    "https://raw.githubusercontent.com/Health-525/timetable/main/data/schedule.json";

  useEffect(() => {
    fetch(scheduleUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const parsed = parseSchedule(data);
        setSchedule(parsed);
      })
      .catch((err) => {
        console.error("Failed to load schedule:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: "load-error",
            role: "assistant",
            content:
              "⚠️ 无法加载课表数据。\n\n请检查：\n1) 网络是否可访问 GitHub raw\n2) NEXT_PUBLIC_SCHEDULE_URL 是否配置正确\n3) 目标 JSON 是否符合 timetable 项目的 data/schedule.json 格式",
          },
        ]);
      });
  }, [scheduleUrl]);

  // Auto-run for demo/screenshots: /?q=today|明天|2026-03-12
  useEffect(() => {
    if (!schedule || autoRan) return;
    const q = (searchParams.get("q") || "").trim();
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

    const result = getItemsForDate(schedule, targetDate);
    const answer = formatDayResponse(targetDate, result.weekNum, result.items);

    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: `${Date.now()}-qa`,
        role: "assistant",
        content: answer,
        cards: result.items,
        dateStr: targetDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }),
        weekNum: result.weekNum
      },
    ]);

    setLoading(false);
  }, [schedule, autoRan, searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 处理快捷 chip 点击
  function handleChipClick(value: string) {
    if (!schedule || loading) return;

    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", content: value },
    ]);
    setLoading(true);

    setTimeout(() => {
      const targetDate = parseDateInput(value);

      if (!targetDate) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-a`,
            role: "assistant",
            content: "我没理解这个日期。\n\n试试：today、明天、周一、YYYY-MM-DD（如 2026-03-12）。",
          },
        ]);
        setLoading(false);
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
          dateStr: targetDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }),
          weekNum: result.weekNum
        },
      ]);
      setLoading(false);
    }, 250);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !schedule || loading) return;

    const text = input.trim();

    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", content: text },
    ]);
    setInput("");
    setLoading(true);

    // Simulate thinking for UX
    setTimeout(() => {
      const targetDate = parseDateInput(text);

      if (!targetDate) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-a`,
            role: "assistant",
            content:
              "我没理解这个日期。\n\n试试：today、明天、周一、YYYY-MM-DD（如 2026-03-12）。",
          },
        ]);
        setLoading(false);
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
          dateStr: targetDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }),
          weekNum: result.weekNum
        },
      ]);
      setLoading(false);
    }, 250);
  }

  // 渲染卡片视图
  function renderCards(msg: Message) {
    if (!msg.cards || msg.cards.length === 0) {
      // 空状态
      return (
        <div
          className="mt-3 p-4 rounded-2xl text-center"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            border: '1px dashed var(--border)'
          }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>今天没有课 🎉</p>
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-2">
        {msg.cards.map((item, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              border: '1px solid var(--border)'
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[13px] font-medium px-2 py-1 rounded-full"
                style={{
                  backgroundColor: item.kind === 'special' ? 'rgba(255, 149, 0, 0.15)' : 'rgba(0, 122, 255, 0.15)',
                  color: item.kind === 'special' ? '#FF9500' : '#007AFF'
                }}
              >
                {item.kind === 'special' ? item.timeText : `第${item.periods.join('-')}节`}
              </span>
              {item.timeText && item.kind === 'course' && (
                <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  {item.timeText}
                </span>
              )}
            </div>
            <p className="mt-2 text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {item.title}
            </p>
            {item.location && (
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                📍 {item.location}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      {/* Header - iOS Style */}
      <header
        className="sticky top-0 z-20 px-5 py-3 flex items-center justify-between"
        style={{
          backgroundColor: 'var(--surface)',
          borderBottom: '0.5px solid var(--border)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)'
        }}
      >
        <h1
          className="text-[17px] font-semibold tracking-[-0.01em]"
          style={{ color: 'var(--text-primary)' }}
        >
          Table Time
        </h1>
        <Link
          href="/about"
          className="text-[15px] font-normal transition-colors duration-200 hover:opacity-70"
          style={{ color: 'var(--accent)' }}
        >
          About
        </Link>
      </header>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 space-y-3 max-w-2xl mx-auto w-full"
        style={{ paddingBottom: 'calc(var(--space-6) + 80px)' }}
      >
        {/* 快捷 Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {quickChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => handleChipClick(chip.value)}
              disabled={loading || !schedule}
              className="px-3 py-1.5 text-[13px] rounded-full transition-all duration-200 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className="max-w-[80%] text-[15px] leading-[1.35] whitespace-pre-line"
              style={{
                padding: '10px 14px',
                borderRadius: msg.role === "user" ? '20px 20px 6px 20px' : '16px',
                backgroundColor: msg.role === "user" ? 'var(--message-user)' : 'var(--message-assistant)',
                color: msg.role === "user" ? 'var(--message-user-text)' : 'var(--message-assistant-text)',
                boxShadow: 'var(--shadow-sm)',
                fontWeight: 400,
                letterSpacing: '-0.01em'
              }}
            >
              {msg.role === "assistant" && msg.cards ? (
                <>
                  <p className="font-medium">{msg.dateStr}（第{msg.weekNum}周）</p>
                  {renderCards(msg)}
                </>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '16px',
                backgroundColor: 'var(--message-assistant)',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div className="flex space-x-[6px]">
                <div
                  className="w-[8px] h-[8px] rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}

                />
                <div
                  className="w-[8px] h-[8px] rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}

                />
                <div
                  className="w-[8px] h-[8px] rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}

                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed Bottom with Frosted Glass */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3"
        style={{
          backgroundColor: 'var(--surface)',
          borderTop: '0.5px solid var(--border)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)'
        }}
      >
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a date: today / 明天 / 2026-03-12"
            className="flex-1 px-4 py-[10px] text-[15px] rounded-full transition-all duration-200"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            disabled={loading || !schedule}
          />
          <button
            type="submit"
            disabled={loading || !schedule || !input.trim()}
            className="px-5 py-[10px] text-[15px] font-medium rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#ffffff'
            }}
          >
            Send
          </button>
        </form>
        <p
          className="text-center text-[11px] mt-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          数据源：{schedule ? "已加载" : "加载中..."}（可用 NEXT_PUBLIC_SCHEDULE_URL 覆盖）
        </p>
      </div>
    </main>
  );
}
