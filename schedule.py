#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None


@dataclass
class Course:
    title: str
    weekday: int  # 1=Mon..7=Sun
    periods: list
    weeks: str
    location: str
    teacher: str


def parse_week_spec(spec: str) -> set[int]:
    """Supports: "1-15", "2-17", "12-13", "1,3,5-7"."""
    weeks: set[int] = set()
    for part in str(spec).replace('，', ',').split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-', 1)
            a, b = int(a), int(b)
            if b < a:
                a, b = b, a
            weeks.update(range(a, b + 1))
        else:
            weeks.add(int(part))
    return weeks


def week_number(d: date, week1_monday: date) -> int:
    # Week 1 starts at week1_monday.
    delta_days = (d - week1_monday).days
    return delta_days // 7 + 1


def weekday_1_to_7(d: date) -> int:
    # Python: Monday=0..Sunday=6
    return d.weekday() + 1


def load_data(path: str):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def default_schedule_path() -> str:
    """Resolve schedule.json path.

    Priority:
    1) env TIMETABLE_SCHEDULE
    2) ./data/schedule.json (new layout)
    3) ./schedule.json (legacy)
    """
    env_path = (os.environ.get('TIMETABLE_SCHEDULE') or '').strip()
    if env_path:
        return env_path
    if os.path.exists('data/schedule.json'):
        return 'data/schedule.json'
    return 'schedule.json'


def format_day(d: date) -> str:
    return d.isoformat()


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: schedule.py today|YYYY-MM-DD")
        return 2

    arg = argv[1].strip().lower()

    schedule_path = default_schedule_path()
    if not os.path.exists(schedule_path):
        print(f"Missing schedule file: {schedule_path}")
        print("\nHow to prepare data:")
        print("1) Put your timetable PDF at: inbound/schedule.pdf (do NOT commit it)")
        print("2) Run: python3 scripts/extract_from_pdf.py")
        print("3) It will generate: data/schedule.json")
        print("\nOr set TIMETABLE_SCHEDULE=/path/to/schedule.json")
        return 2

    data = load_data(schedule_path)
    tz = data.get('meta', {}).get('tz', 'Asia/Shanghai')
    week1 = date.fromisoformat(data.get('meta', {}).get('week1_monday', '2026-03-02'))

    if arg == 'today':
        if ZoneInfo is None:
            today = date.today()
        else:
            today = datetime.now(ZoneInfo(tz)).date()
        d = today
    else:
        d = date.fromisoformat(argv[1])

    wno = week_number(d, week1)
    wday = weekday_1_to_7(d)

    # Load courses
    courses = []
    for c in data.get('courses', []):
        courses.append(Course(
            title=c.get('title', ''),
            weekday=int(c.get('weekday')),
            periods=list(c.get('periods', [])),
            weeks=str(c.get('weeks', '')).strip(),
            location=c.get('location', ''),
            teacher=c.get('teacher', ''),
        ))

    matches = []
    for c in courses:
        if c.weekday != wday:
            continue
        if wno not in parse_week_spec(c.weeks):
            continue
        matches.append(c)

    # Special (non-period) items, e.g. practice week
    specials = []
    for s in data.get('special', []) or []:
        weeks = str(s.get('weeks', '')).strip()
        if weeks and wno not in parse_week_spec(weeks):
            continue
        wdays = s.get('weekday')
        if isinstance(wdays, int):
            ok_day = (wdays == wday)
        elif isinstance(wdays, list):
            ok_day = (wday in [int(x) for x in wdays])
        else:
            ok_day = False
        if not ok_day:
            continue
        specials.append(s)

    # Sort by first period
    matches.sort(key=lambda x: (min(x.periods) if x.periods else 999, x.title))

    period_times = {int(k): v for k, v in (data.get('periodTimes') or {}).items()}

    # Output
    print(f"{format_day(d)}（第{wno}周 周{['','一','二','三','四','五','六','日'][wday]}）")

    if not matches and not specials:
        print("今天没有课")
        return 0

    # Print specials first (time-range items)
    for s in specials:
        title = s.get('title', '')
        loc = s.get('location', '') or "(地点待补)"
        for t in (s.get('times') or []):
            st = t.get('start','')
            ed = t.get('end','')
            ttxt = f"{st}-{ed}".strip('-')
            print(f"- {ttxt}｜{title}｜{loc}")

    for c in matches:
        ps = c.periods
        if ps:
            ptxt = f"{ps[0]}" if len(ps) == 1 else f"{ps[0]}-{ps[-1]}"
            if len(ps) == 1:
                ttxt = f"{period_times.get(ps[0], '')}"
            else:
                first = period_times.get(ps[0], '')
                last = period_times.get(ps[-1], '')
                # Expect "HH:MM-HH:MM"; fall back to raw strings if format differs.
                if '-' in first and '-' in last:
                    start = first.split('-', 1)[0].strip()
                    end = last.split('-', 1)[1].strip()
                    ttxt = f"{start}-{end}" if (start and end) else f"{first}~{last}".strip('~')
                else:
                    ttxt = f"{first}~{last}".strip('~')
        else:
            ptxt, ttxt = "?", ""
        loc = c.location or "(地点待补)"
        print(f"- 第{ptxt}节 {ttxt}｜{c.title}｜{loc}")

    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
