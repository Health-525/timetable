"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseSchedule, getItemsForDate, formatDayResponse, RawScheduleData } from "@/lib/schedule";
import { parseDateInput } from "@/lib/date-parser";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
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

    const { weekNum, items } = getItemsForDate(schedule, targetDate);
    const answer = formatDayResponse(targetDate, weekNum, items);

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: `${Date.now()}-qa`, role: "assistant", content: answer },
    ]);

    setLoading(false);
  }, [schedule, autoRan, searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

      const { weekNum, items } = getItemsForDate(schedule, targetDate);
      const answer = formatDayResponse(targetDate, weekNum, items);

      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-a`, role: "assistant", content: answer },
      ]);
      setLoading(false);
    }, 250);
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
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className="max-w-[80%] text-[15px] leading-[1.35] whitespace-pre-line"
              style={{
                padding: '10px 14px',
                borderRadius: msg.role === "user" ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
                backgroundColor: msg.role === "user" ? 'var(--message-user)' : 'var(--message-assistant)',
                color: msg.role === "user" ? 'var(--message-user-text)' : 'var(--message-assistant-text)',
                boxShadow: 'var(--shadow-sm)',
                fontWeight: 400,
                letterSpacing: '-0.01em'
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '20px 20px 20px 6px',
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
