import { RawScheduleData, getItemsForDate } from "@/lib/schedule";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatICSDate(d: Date) {
  // Local time (floating) in YYYYMMDDTHHMMSS
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

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildWeekICS(schedule: RawScheduleData, baseDate: Date) {
  // baseDate is already normalized to 00:00 in caller; treat it as local.
  const weekday = ((baseDate.getDay() + 6) % 7) + 1; // 1..7 Mon..Sun
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (weekday - 1));

  const events: Array<{ start: Date; end: Date; summary: string; location?: string; description?: string }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    const { items } = getItemsForDate(schedule, d);
    for (const it of items) {
      if (!it.timeText) continue;
      const [startStr, endStr] = it.timeText.split("-");
      if (!startStr || !endStr) continue;
      const start = new Date(d);
      const end = new Date(d);
      const [sh, sm] = startStr.split(":").map(Number);
      const [eh, em] = endStr.split(":").map(Number);
      if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) continue;
      start.setHours(sh, sm, 0, 0);
      end.setHours(eh, em, 0, 0);

      const descParts: string[] = [];
      if (it.kind === "course" && it.teacher) descParts.push(`老师: ${it.teacher}`);
      if (it.kind === "special" && it.note) descParts.push(it.note);

      events.push({
        start,
        end,
        summary: it.title,
        location: it.location,
        description: descParts.join("\n") || undefined,
      });
    }
  }

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//ZaoZaoBa//Timetable//CN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");

  for (const ev of events) {
    const uid = `${formatICSDate(ev.start)}-${Math.random().toString(16).slice(2)}@zaoz8`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
    lines.push(`DTSTART:${formatICSDate(ev.start)}`);
    lines.push(`DTEND:${formatICSDate(ev.end)}`);
    lines.push(`SUMMARY:${esc(ev.summary)}`);
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
