#!/usr/bin/env node
// -*- coding: utf-8 -*-

const fs = require("fs");
const path = require("path");
const { parseWeekSpec } = require("./schedule");

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

function parseLocalDate(isoString) {
  const [year, month, day] = String(isoString).split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
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

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/\(\s*多\s*\)$/u, "").trim();
}

function loadSchedule(schedulePath) {
  return JSON.parse(fs.readFileSync(schedulePath, "utf-8"));
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
  return maxWeek;
}

function buildEvents(schedule) {
  const week1Monday = parseLocalDate(schedule.meta?.week1_monday || "2026-03-02");
  const periodTimes = schedule.periodTimes || {};
  const maxWeek = getMaxWeek(schedule);
  const events = [];

  for (let week = 1; week <= maxWeek; week++) {
    for (let weekday = 1; weekday <= 7; weekday++) {
      const date = addDays(week1Monday, (week - 1) * 7 + (weekday - 1));
      const specialWindows = new Set();

      for (const item of schedule.special || []) {
        const weeks = parseWeekSpec(String(item.weeks || ""));
        if (weeks.length && !weeks.includes(week)) continue;

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
          });
        }
      }

      for (const course of schedule.courses || []) {
        if (Number(course.weekday) !== weekday) continue;

        const weeks = parseWeekSpec(String(course.weeks || ""));
        if (weeks.length && !weeks.includes(week)) continue;

        const window = getPeriodWindow(periodTimes, course.periods);
        if (!window) continue;
        if (specialWindows.has(`${window.start}-${window.end}`)) continue;

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

        events.push({
          start,
          end,
          summary: cleanText(course.title),
          location: cleanText(course.location),
          description: details.join("\\n"),
          startText: window.start,
        });
      }
    }
  }

  events.sort((a, b) => a.start - b.start || a.summary.localeCompare(b.summary, "zh-CN"));
  return events;
}

function buildICS(schedule) {
  const events = buildEvents(schedule);
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//jiangshu-study//Timetable//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:姜书课表",
    `X-WR-TIMEZONE:${schedule.meta?.tz || "Asia/Shanghai"}`,
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${generateUID(event.start, event.startText, event.summary)}`);
    lines.push(`DTSTAMP:${formatICSDate(now)}`);
    lines.push(`DTSTART:${formatICSDate(event.start)}`);
    lines.push(`DTEND:${formatICSDate(event.end)}`);
    lines.push(`SUMMARY:${esc(event.summary)}`);
    if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function main(argv) {
  const schedulePath = path.resolve(argv[2] || "data/schedule.json");
  const outputPath = path.resolve(argv[3] || "课表.ics");

  if (!fs.existsSync(schedulePath)) {
    console.error(`Missing schedule file: ${schedulePath}`);
    return 2;
  }

  const schedule = loadSchedule(schedulePath);
  const ics = buildICS(schedule);
  fs.writeFileSync(outputPath, ics, "utf-8");
  console.log(`ICS exported: ${outputPath}`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { buildICS, buildEvents };
