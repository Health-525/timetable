import { cache } from "react";
import { parseSchedule, RawScheduleData } from "@/lib/schedule";

export const getScheduleUrl = () =>
  process.env.SCHEDULE_URL ||
  process.env.NEXT_PUBLIC_SCHEDULE_URL ||
  "https://raw.githubusercontent.com/Health-525/timetable/main/data/schedule.json";

export const loadSchedule = cache(async (): Promise<RawScheduleData> => {
  const url = getScheduleUrl();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const res = await fetch(url, {
    signal: controller.signal,
    // Best-effort caching for GitHub raw.
    // Adjust as needed if you want always-fresh.
    next: { revalidate: 60 },
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    throw new Error(`Failed to fetch schedule: HTTP ${res.status}`);
  }

  const json = (await res.json()) as unknown;
  return parseSchedule(json);
});
