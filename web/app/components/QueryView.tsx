"use client";
import { memo, useMemo, useState, useCallback, useEffect } from "react";
import { RawScheduleData, formatDayResponse, Weekday, getWeekNumber } from "@/lib/schedule";
import { parseDateInput } from "@/lib/date-parser";
import {
  Adjustment,
  AdjustmentMode,
  loadAdjustments,
  addAdjustment,
  undoLastAdjustment,
  getAdjustedItemsForDate,
  checkConflict,
} from "@/lib/adjustments";
import DayCard, { SelectedCourse } from "./DayCard";

interface QueryViewProps {
  query: string;
  onQueryChange: (value: string) => void;
  schedule: RawScheduleData;
  onSelect: (course: SelectedCourse) => void;
}
const QUICK_BUTTONS = [
  { label: "今天", value: "今天" },
  { label: "明天", value: "明天" },
  { label: "周末", value: "周末" },
  { label: "下周一", value: "下周一" },
];

const WEEKDAY_OPTIONS: { label: string; value: Weekday }[] = [
  { label: "周一", value: 1 },
  { label: "周二", value: 2 },
  { label: "周三", value: 3 },
  { label: "周四", value: 4 },
  { label: "周五", value: 5 },
  { label: "周六", value: 6 },
  { label: "周日", value: 7 },
];

const PERIOD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * 查询页面组件
 */
function QueryView({ query, onQueryChange, schedule, onSelect }: QueryViewProps) {
  // 调课助手状态
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [showAdjPanel, setShowAdjPanel] = useState(false);
  const [sourceWeekday, setSourceWeekday] = useState<Weekday>(1);
  const [sourcePeriodStart, setSourcePeriodStart] = useState(1);
  const [sourcePeriodEnd, setSourcePeriodEnd] = useState(2);
  const [targetWeekday, setTargetWeekday] = useState<Weekday>(1);
  const [targetPeriodStart, setTargetPeriodStart] = useState(1);
  const [targetPeriodEnd, setTargetPeriodEnd] = useState(2);
  const [mode, setMode] = useState<AdjustmentMode>("once");
  const [startWeek, setStartWeek] = useState(1);
  const [previewResult, setPreviewResult] = useState<{ ok: boolean; message: string } | null>(null);

  // 加载调课记录
  useEffect(() => {
    setAdjustments(loadAdjustments());
  }, []);

  // 根据查询日期计算默认周次
  useEffect(() => {
    const d = parseDateInput(query);
    if (d) {
      const weekNum = getWeekNumber(d, schedule.meta.week1_monday);
      setStartWeek(weekNum);
    }
  }, [query, schedule]);

  const result = useMemo(() => {
    const d = parseDateInput(query);
    if (!d) return null;
    const { weekNum, items } = getAdjustedItemsForDate(schedule, d, adjustments);
    const text = formatDayResponse(d, weekNum, items);
    const title = d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
    return { title, weekNum, items, text };
  }, [schedule, query, adjustments]);

  const handlePreview = useCallback(() => {
    const targetPeriods = Array.from(
      { length: targetPeriodEnd - targetPeriodStart + 1 },
      (_, i) => targetPeriodStart + i
    );
    const conflict = checkConflict(
      schedule,
      adjustments,
      targetWeekday,
      targetPeriods,
      startWeek
    );

    if (conflict.hasConflict) {
      setPreviewResult({ ok: false, message: `冲突：目标时间与「${conflict.conflictWith}」重叠` });
    } else {
      setPreviewResult({ ok: true, message: "预览通过，无冲突" });
    }
  }, [schedule, adjustments, targetWeekday, targetPeriodStart, targetPeriodEnd, startWeek]);

  const handleApply = useCallback(() => {
    if (!previewResult?.ok) return;
    const sourcePeriods = Array.from(
      { length: sourcePeriodEnd - sourcePeriodStart + 1 },
      (_, i) => sourcePeriodStart + i
    );
    const targetPeriods = Array.from(
      { length: targetPeriodEnd - targetPeriodStart + 1 },
      (_, i) => targetPeriodStart + i
    );
    addAdjustment({
      sourceWeekday,
      sourcePeriods,
      targetWeekday,
      targetPeriods,
      mode,
      startWeek,
      specificWeek: mode === "once" ? startWeek : undefined,
    });
    setAdjustments(loadAdjustments());
    setPreviewResult(null);
  }, [previewResult, sourceWeekday, sourcePeriodStart, sourcePeriodEnd, targetWeekday, targetPeriodStart, targetPeriodEnd, mode, startWeek]);

  const handleUndo = useCallback(() => {
    const undone = undoLastAdjustment();
    if (undone) {
      setAdjustments(loadAdjustments());
      setPreviewResult({ ok: true, message: `已撤销：${undone.sourceWeekday}→${undone.targetWeekday}` });
    }
  }, []);

  return (
    <section
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
        输入一个日期
      </div>
      <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
        支持：今天/明天/周末/下周一/2026-03-12
      </div>
      {/* 快捷按钮 */}
      <div className="mt-3 flex gap-2 flex-wrap">
        {QUICK_BUTTONS.map((btn) => (
          <button
            key={btn.value}
            type="button"
            onClick={() => onQueryChange(btn.value)}
            className="px-3 py-1.5 text-[12px] rounded-full active:scale-95 transition-transform"
            style={{
              backgroundColor: "rgba(255,122,26,0.08)",
              color: "var(--text-secondary)",
              border: "1px solid rgba(255,122,26,0.12)",
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="例如：今天 / 周末 / 2026-03-12"
          className="flex-1 px-4 py-3 text-[15px] rounded-2xl"
          style={{
            backgroundColor: "#fff",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="px-4 py-3 text-[13px] rounded-2xl active:scale-95 transition-transform"
            style={{
              backgroundColor: "rgba(255,122,26,0.12)",
              color: "var(--accent)",
              border: "1px solid rgba(255,122,26,0.18)",
            }}
          >
            清空
          </button>
        )}
      </div>
      <div className="mt-3">
        {query && !result ? (
          <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            没识别出来，换个输入试试。
          </div>
        ) : null}
        {result ? (
          <div className="mt-3">
            <DayCard
              title={result.title}
              weekNum={result.weekNum}
              items={result.items}
              rawText={result.text}
              onSelect={onSelect}
            />
          </div>
        ) : null}
      </div>

      {/* 调课助手卡片 */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => setShowAdjPanel((v) => !v)}
          className="flex items-center gap-2 text-[13px] font-medium"
          style={{ color: "var(--accent)" }}
        >
          <span>{showAdjPanel ? "▼" : "▶"}</span>
          <span>调课助手</span>
          {adjustments.length > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,122,26,0.12)" }}>
              {adjustments.length}
            </span>
          )}
        </button>

        {showAdjPanel && (
          <div className="mt-3 space-y-3">
            {/* 原课 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>原课</span>
              <select
                value={sourceWeekday}
                onChange={(e) => setSourceWeekday(Number(e.target.value) as Weekday)}
                className="text-[12px] px-2 py-1 rounded-lg border"
                style={{ borderColor: "var(--border)", backgroundColor: "#fff" }}
              >
                {WEEKDAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>第</span>
              <select
                value={sourcePeriodStart}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSourcePeriodStart(v);
                  if (v > sourcePeriodEnd) setSourcePeriodEnd(v);
                }}
                className="text-[12px] px-2 py-1 rounded-lg border"
                style={{ borderColor: "var(--border)", backgroundColor: "#fff" }}
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>-</span>
              <select
                value={sourcePeriodEnd}
                onChange={(e) => setSourcePeriodEnd(Number(e.target.value))}
                className="text-[12px] px-2 py-1 rounded-lg border"
                style={{ borderColor: "var(--border)", backgroundColor: "#fff" }}
              >
                {PERIOD_OPTIONS.filter((p) => p >= sourcePeriodStart).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>节</span>
            </div>

            {/* 目标 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>目标</span>
              <select
                value={targetWeekday}
                onChange={(e) => setTargetWeekday(Number(e.target.value) as Weekday)}
                className="text-[12px] px-2 py-1 rounded-lg border"
                style={{ borderColor: "var(--border)", backgroundColor: "#fff" }}
              >
                {WEEKDAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>第</span>
              <select
                value={targetPeriodStart}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTargetPeriodStart(v);
                  if (v > targetPeriodEnd) setTargetPeriodEnd(v);
                }}
                className="text-[12px] px-2 py-1 rounded-lg border"
                style={{ borderColor: "var(--border)", backgroundColor: "#fff" }}
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>-</span>
              <select
                value={targetPeriodEnd}
                onChange={(e) => setTargetPeriodEnd(Number(e.target.value))}
                className="text-[12px] px-2 py-1 rounded-lg border"
                style={{ borderColor: "var(--border)", backgroundColor: "#fff" }}
              >
                {PERIOD_OPTIONS.filter((p) => p >= targetPeriodStart).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>节</span>
            </div>

            {/* 模式 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>模式</span>
              <button
                type="button"
                onClick={() => setMode("once")}
                className={`px-3 py-1 text-[12px] rounded-full transition-colors ${mode === "once" ? "text-white" : ""}`}
                style={mode === "once" ? { backgroundColor: "var(--accent)" } : { backgroundColor: "rgba(255,122,26,0.08)", color: "var(--text-secondary)" }}
              >
                单次
              </button>
              <button
                type="button"
                onClick={() => setMode("longterm")}
                className={`px-3 py-1 text-[12px] rounded-full transition-colors ${mode === "longterm" ? "text-white" : ""}`}
                style={mode === "longterm" ? { backgroundColor: "var(--accent)" } : { backgroundColor: "rgba(255,122,26,0.08)", color: "var(--text-secondary)" }}
              >
                长期
              </button>
              <span className="text-[12px] ml-2" style={{ color: "var(--text-secondary)" }}>从第</span>
              <input
                type="number"
                min={1}
                max={20}
                value={startWeek}
                onChange={(e) => setStartWeek(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="w-14 text-[12px] px-2 py-1 rounded-lg border text-center"
                style={{ borderColor: "var(--border)", backgroundColor: "#fff" }}
              />
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>周{mode === "once" ? "" : "开始"}</span>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePreview}
                className="px-4 py-2 text-[12px] rounded-xl active:scale-95 transition-transform"
                style={{ backgroundColor: "rgba(255,122,26,0.12)", color: "var(--accent)", border: "1px solid rgba(255,122,26,0.18)" }}
              >
                预览
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!previewResult?.ok}
                className="px-4 py-2 text-[12px] rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)", color: "#fff" }}
              >
                应用
              </button>
              <button
                type="button"
                onClick={handleUndo}
                disabled={adjustments.length === 0}
                className="px-4 py-2 text-[12px] rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                style={{ backgroundColor: "rgba(255,59,48,0.12)", color: "#ff3b30", border: "1px solid rgba(255,59,48,0.18)" }}
              >
                撤销最近一次
              </button>
            </div>

            {/* 预览结果 */}
            {previewResult && (
              <div
                className="text-[12px] px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: previewResult.ok ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)",
                  color: previewResult.ok ? "#34c759" : "#ff3b30",
                }}
              >
                {previewResult.message}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
export default memo(QueryView);
