#!/usr/bin/env node
// -*- coding: utf-8 -*-

const fs = require("fs");
const path = require("path");
const { parseWeekSpec } = require("./schedule");

function hasWeek(spec, week) {
  const weeks = parseWeekSpec(String(spec || ""));
  if (weeks instanceof Set) {
    return weeks.size === 0 || weeks.has(week);
  }
  if (Array.isArray(weeks)) {
    return weeks.length === 0 || weeks.includes(week);
  }
  return true;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatICSDate(d) {
  return (
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    "T" +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    "00"
  );
}

function formatICSUTCDate(d) {
  return (
    d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

function parseLocalDate(isoString) {
  const [year, month, day] = String(isoString).split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function parseLocalDateTime(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const normalized = raw.replace("T", " ");
  const [datePart, timePart = "00:00"] = normalized.split(/\s+/, 2);
  const [year, month, day] = String(datePart).split("-").map(Number);
  const [hour, minute] = String(timePart).split(":").map(Number);

  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function esc(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldICSLine(line) {
  const text = String(line || "");
  if (Buffer.byteLength(text, "utf8") <= 75) return [text];

  const parts = [];
  let current = "";

  for (const ch of text) {
    const candidate = current + ch;
    if (Buffer.byteLength(candidate, "utf8") > 75) {
      parts.push(current);
      current = ` ${ch}`;
    } else {
      current = candidate;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/\(\s*多\s*\)$/u, "").trim();
}

function loadSchedule(schedulePath) {
  return JSON.parse(fs.readFileSync(schedulePath, "utf-8"));
}

function loadAdjustments(adjustmentsPath) {
  if (!adjustmentsPath || !fs.existsSync(adjustmentsPath)) return [];
  return JSON.parse(fs.readFileSync(adjustmentsPath, "utf-8"));
}

function getPeriodWindow(periodTimes, periods) {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const first = String(periodTimes[String(periods[0])] || "");
  const last = String(periodTimes[String(periods[periods.length - 1])] || "");
  if (!first.includes("-") || !last.includes("-")) return null;
  const start = first.split("-", 1)[0].trim();
  const end = last.split("-", 2)[1].trim();
  if (!start || !end) return null;
  return { start, end };
}

function parseClock(text) {
  const [hour, minute] = String(text).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
}

function clockToMinutes(clockText) {
  const clock = parseClock(clockText);
  if (!clock) return null;
  return clock.hour * 60 + clock.minute;
}

function minutesToClock(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function generateUID(date, startText, title) {
  const base = `${formatICSDate(date)}-${startText}-${title}`;
  let hash = 0;
  for (const ch of base) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `${formatICSDate(date)}-${hash}@jiangshu-study`;
}

function getMaxWeek(schedule) {
  const specs = [];
  for (const course of schedule.courses || []) specs.push(course.weeks);
  for (const item of schedule.special || []) specs.push(item.weeks);

  let maxWeek = 1;
  for (const spec of specs) {
    for (const week of parseWeekSpec(String(spec || ""))) {
      if (week > maxWeek) maxWeek = week;
    }
  }

  // If there are explicit one-off events, ensure we include weeks covering them.
  const week1Monday = parseLocalDate(schedule.meta?.week1_monday || "2026-03-02");
  for (const item of schedule.oneOff || []) {
    const start = parseLocalDateTime(item.start);
    if (!start) continue;
    const deltaDays = Math.floor((start - week1Monday) / 86400000);
    const week = Math.floor(deltaDays / 7) + 1;
    if (week > maxWeek) maxWeek = week;
  }

  return maxWeek;
}

function findMatchingAdjustment(adjustments, event) {
  for (const adj of adjustments) {
    const adjTitle = String(adj.courseTitle || "");
    const summary = String(event.summary || "");
    if (adjTitle && !summary.includes(adjTitle) && !adjTitle.includes(summary)) continue;

    const mode = adj.mode || "once";
    if (mode === "once" && Number(adj.specificWeek) !== event.week) continue;
    if (mode === "longterm" && event.week < Number(adj.startWeek || 0)) continue;
    if (Number(adj.sourceWeekday) !== event.weekday) continue;

    const sourcePeriods = Array.isArray(adj.sourcePeriods) ? adj.sourcePeriods.map(Number) : [];
    if (sourcePeriods.join(",") !== event.periods.join(",")) continue;

    return adj;
  }

  return null;
}

function applyAdjustmentToEvent(event, adjustment, periodTimes) {
  if (!adjustment) return event;

  const next = { ...event };
  const targetWeekday = Number(adjustment.targetWeekday || event.weekday);
  const targetPeriods = Array.isArray(adjustment.targetPeriods)
    ? adjustment.targetPeriods.map(Number)
    : event.periods;

  const weekdayDelta = targetWeekday - event.weekday;
  if (weekdayDelta !== 0) {
    next.start = addDays(next.start, weekdayDelta);
    next.end = addDays(next.end, weekdayDelta);
  }

  const targetWindow = getPeriodWindow(periodTimes, targetPeriods);
  if (targetWindow) {
    const startClock = parseClock(targetWindow.start);
    const endClock = parseClock(targetWindow.end);
    if (startClock && endClock) {
      next.start.setHours(startClock.hour, startClock.minute, 0, 0);
      next.end.setHours(endClock.hour, endClock.minute, 0, 0);
      next.startText = targetWindow.start;
    }
  }

  if (adjustment.targetLocation) {
    next.location = cleanText(adjustment.targetLocation);
  }

  next.weekday = targetWeekday;
  next.periods = targetPeriods;
  return next;
}

function buildEvents(schedule, adjustments = []) {
  const week1Monday = parseLocalDate(schedule.meta?.week1_monday || "2026-03-02");
  const periodTimes = schedule.periodTimes || {};
  const maxWeek = getMaxWeek(schedule);
  const events = [];

  for (let week = 1; week <= maxWeek; week++) {
    for (let weekday = 1; weekday <= 7; weekday++) {
      const date = addDays(week1Monday, (week - 1) * 7 + (weekday - 1));
      const specialWindows = new Set();

      for (const item of schedule.special || []) {
        if (!hasWeek(item.weeks, week)) continue;

        const weekdays = Array.isArray(item.weekday) ? item.weekday.map(Number) : [Number(item.weekday)];
        if (!weekdays.includes(weekday)) continue;

        for (const time of item.times || []) {
          const startClock = parseClock(time.start);
          const endClock = parseClock(time.end);
          if (!startClock || !endClock) continue;

          specialWindows.add(`${time.start}-${time.end}`);

          const start = new Date(date);
          const end = new Date(date);
          start.setHours(startClock.hour, startClock.minute, 0, 0);
          end.setHours(endClock.hour, endClock.minute, 0, 0);

          events.push({
            start,
            end,
            summary: cleanText(item.title),
            location: cleanText(item.location),
            description: cleanText(item.note),
            startText: time.start,
            week,
            weekday,
            periods: [],
          });
        }
      }

      // One-off events can block normal course windows to avoid duplicates.
      // Example: hackathon overlaps a Friday afternoon class.
      const blockedRanges = [];
      for (const item of schedule.oneOff || []) {
        const start = parseLocalDateTime(item.start);
        const end = parseLocalDateTime(item.end);
        if (!start || !end) continue;

        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        if (end <= dayStart || start >= dayEnd) continue;

        const s = Math.max(start.getTime(), dayStart.getTime());
        const e = Math.min(end.getTime(), dayEnd.getTime());
        const sDate = new Date(s);
        const eDate = new Date(e);
        const sMins = sDate.getHours() * 60 + sDate.getMinutes();
        const eMins = eDate.getHours() * 60 + eDate.getMinutes();
        if (eMins > sMins) blockedRanges.push([sMins, eMins]);
      }

      for (const course of schedule.courses || []) {
        if (Number(course.weekday) !== weekday) continue;
        if (!hasWeek(course.weeks, week)) continue;

        const window = getPeriodWindow(periodTimes, course.periods);
        if (!window) continue;
        if (specialWindows.has(`${window.start}-${window.end}`)) continue;

        const wStart = clockToMinutes(window.start);
        const wEnd = clockToMinutes(window.end);
        if (wStart != null && wEnd != null) {
          const overlapped = blockedRanges.some(([bs, be]) => rangesOverlap(wStart, wEnd, bs, be));
          if (overlapped) continue;
        }

        const startClock = parseClock(window.start);
        const endClock = parseClock(window.end);
        if (!startClock || !endClock) continue;

        const start = new Date(date);
        const end = new Date(date);
        start.setHours(startClock.hour, startClock.minute, 0, 0);
        end.setHours(endClock.hour, endClock.minute, 0, 0);

        const details = [];
        if (course.teacher) details.push(`老师: ${cleanText(course.teacher)}`);
        if (Array.isArray(course.periods) && course.periods.length > 0) {
          const startPeriod = course.periods[0];
          const endPeriod = course.periods[course.periods.length - 1];
          details.push(`节次: 第${startPeriod}${startPeriod === endPeriod ? "" : `-${endPeriod}`}节`);
        }

        const baseEvent = {
          start,
          end,
          summary: cleanText(course.title),
          location: cleanText(course.location),
          description: details.join("\\n"),
          startText: window.start,
          week,
          weekday,
          periods: Array.isArray(course.periods) ? course.periods.map(Number) : [],
        };

        events.push(
          applyAdjustmentToEvent(
            baseEvent,
            findMatchingAdjustment(adjustments, baseEvent),
            periodTimes
          )
        );
      }
    }
  }

  // One-off events with explicit datetimes (not tied to week/period rules)
  for (const item of schedule.oneOff || []) {
    const start = parseLocalDateTime(item.start);
    const end = parseLocalDateTime(item.end);
    if (!start || !end) continue;

    const deltaDays = Math.floor((start - week1Monday) / 86400000);
    const week = Math.floor(deltaDays / 7) + 1;
    const weekday = ((start.getDay() + 6) % 7) + 1; // Mon=1..Sun=7

    events.push({
      start,
      end,
      summary: cleanText(item.title),
      location: cleanText(item.location),
      description: cleanText(item.note),
      startText: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
      week,
      weekday,
      periods: [],
    });
  }

  events.sort((a, b) => a.start - b.start || a.summary.localeCompare(b.summary, "zh-CN"));
  return events;
}

function buildICS(schedule, adjustments = []) {
  const events = buildEvents(schedule, adjustments);
  const now = new Date();
  const reminderMinutes = 30;
  const tzid = schedule.meta?.tz || "Asia/Shanghai";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//jiangshu-study//Timetable//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:姜书课表",
    `X-WR-TIMEZONE:${tzid}`,
    "BEGIN:VTIMEZONE",
    `TZID:${tzid}`,
    "X-LIC-LOCATION:Asia/Shanghai",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${generateUID(event.start, event.startText, event.summary)}`);
    lines.push(`DTSTAMP:${formatICSUTCDate(now)}`);
    lines.push(`DTSTART;TZID=${tzid}:${formatICSDate(event.start)}`);
    lines.push(`DTEND;TZID=${tzid}:${formatICSDate(event.end)}`);
    lines.push(`SUMMARY:${esc(event.summary)}`);
    if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
    lines.push("BEGIN:VALARM");
    lines.push(`TRIGGER:-PT${reminderMinutes}M`);
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${esc(`课程开始前 ${reminderMinutes} 分钟提醒：${event.summary}`)}`);
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.flatMap(foldICSLine).join("\r\n")}\r\n`;
}

function main(argv) {
  const schedulePath = path.resolve(argv[2] || "data/schedule.json");
  const adjustmentsPath = path.resolve(argv[4] || process.env.TIMETABLE_ADJUSTMENTS_PATH || "data/adjustments.json");
  const outputPath = path.resolve(argv[3] || "课表.ics");

  if (!fs.existsSync(schedulePath)) {
    console.error(`Missing schedule file: ${schedulePath}`);
    return 2;
  }

  const schedule = loadSchedule(schedulePath);
  const adjustments = loadAdjustments(adjustmentsPath);
  const ics = buildICS(schedule, adjustments);
  fs.writeFileSync(outputPath, ics, "utf-8");
  console.log(`ICS exported: ${outputPath}`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { buildICS, buildEvents };
