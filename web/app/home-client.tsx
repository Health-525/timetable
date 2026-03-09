"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

  // 复制地点到剪贴板
  const copyLocation = useCallback((location: string) => {
    navigator.clipboard.writeText(location).then(() => {
      // 可以在这里添加 toast 提示，暂时用 console
      console.log("已复制:", location);
    }).catch((err) => {
      console.error("复制失败:", err);
    });
  }, []);

  // 渲染卡片视图
  function renderCards(msg: Message) {
    if (!msg.cards || msg.cards.length === 0) {
      // 空状态
      return (
        <div
          className="mt-3 p-4 rounded-2xl text-center"
          style={{
            backgroundColor: 'transparent',
            border: '1px dashed var(--border)'
          }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>今天没有课 🎉</p>
        </div>
      );
    }

    return (
      <div
        className="mt-3 flex flex-col gap-2"
        style={{
          backgroundColor: 'rgba(0,0,0,0.03)',
          borderRadius: '12px',
          padding: '8px'
        }}
      >
        {msg.cards.map((item, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl cursor-pointer transition-all duration-150 active:scale-[0.98]"
            style={{
              backgroundColor: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(0,0,0,0.06)'
            }}
            onClick={() => item.location && copyLocation(item.location)}
            title={item.location ? "点击复制地点" : undefined}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: item.kind === 'special' ? 'rgba(255, 149, 0, 0.12)' : 'rgba(0, 122, 255, 0.12)',
                  color: item.kind === 'special' ? '#FF9500' : '#007AFF',
                  letterSpacing: '-0.01em'
                }}
              >
                {item.kind === 'special' ? item.timeText : `第${item.periods.join('-')}节`}
              </span>
              {item.timeText && item.kind === 'course' && (
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {item.timeText}
                </span>
              )}
            </div>
            <p className="mt-2 text-[15px] font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {item.title}
            </p>
            {item.location && (
              <div className="mt-1.5 flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {item.location}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 渲染欢迎消息（气泡风格）
  function renderWelcomeBubble() {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[85%] text-[15px] leading-[1.4] whitespace-pre-line"
          style={{
            padding: '12px 16px',
            borderRadius: '18px 18px 18px 6px',
            backgroundColor: 'var(--message-assistant)',
            color: 'var(--message-assistant-text)',
            fontWeight: 400,
            letterSpacing: '-0.01em'
          }}
        >
          <p className="font-semibold mb-1">你好！我是课表助手 👋</p>
          <p className="text-[14px] opacity-90">你可以这样问：</p>
          <ul className="mt-1 space-y-0.5 text-[14px] opacity-90">
            <li>• today / 今天</li>
            <li>• 明天</li>
            <li>• 周一/周二/...</li>
            <li>• 2026-03-12</li>
          </ul>
        </div>
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
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between"
        style={{
          backgroundColor: 'rgba(242, 242, 247, 0.85)',
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

      {/* Chips Toolbar - 二级工具栏 */}
      <div
        className="sticky top-[49px] z-10 px-4 py-2 overflow-x-auto"
        style={{
          backgroundColor: 'rgba(242, 242, 247, 0.72)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          borderBottom: '0.5px solid var(--border)',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
          {quickChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => handleChipClick(chip.value)}
              disabled={loading || !schedule}
              className="px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-all duration-150 hover:opacity-80 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                color: 'var(--text-primary)'
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        style={{
          paddingBottom: 'calc(var(--space-6) + 100px)',
          maxWidth: '680px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        {messages.map((msg) => (
          msg.id === "welcome" ? (
            <div key={msg.id}>{renderWelcomeBubble()}</div>
          ) : (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className="max-w-[85%] text-[15px] leading-[1.4] whitespace-pre-line"
              style={{
                padding: msg.role === "user" ? '10px 16px' : '12px 16px',
                borderRadius: msg.role === "user" ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
                backgroundColor: msg.role === "user" ? 'var(--message-user)' : 'var(--message-assistant)',
                color: msg.role === "user" ? 'var(--message-user-text)' : 'var(--message-assistant-text)',
                fontWeight: 400,
                letterSpacing: '-0.01em'
              }}
            >
              {msg.role === "assistant" && msg.cards ? (
                <>
                  <p className="font-semibold text-[14px] mb-1" style={{ opacity: 0.9 }}>
                    {msg.dateStr}（第{msg.weekNum}周）
                  </p>
                  {renderCards(msg)}
                </>
              ) : (
                msg.content
              )}
            </div>
          </div>
          )
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '18px 18px 18px 6px',
                backgroundColor: 'var(--message-assistant)',
              }}
            >
              <div className="flex space-x-1.5">
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
        className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3.5"
        style={{
          backgroundColor: 'rgba(242, 242, 247, 0.85)',
          borderTop: '0.5px solid var(--border)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          maxWidth: '680px',
          margin: '0 auto',
          left: '0',
          right: '0'
        }}
      >
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入日期..."
            className="flex-1 px-4 py-2.5 text-[15px] rounded-full transition-all duration-200"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              color: 'var(--text-primary)',
            }}
            disabled={loading || !schedule}
          />
          <button
            type="submit"
            disabled={loading || !schedule || !input.trim()}
            className="px-5 py-2.5 text-[15px] font-semibold rounded-full transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#ffffff'
            }}
          >
            发送
          </button>
        </form>
        <p
          className="text-center text-[11px] mt-2 opacity-70"
          style={{ color: 'var(--text-secondary)' }}
        >
          数据源：{schedule ? "已加载" : "加载中..."}（可用 NEXT_PUBLIC_SCHEDULE_URL 覆盖）
        </p>
      </div>
    </main>
  );
}
