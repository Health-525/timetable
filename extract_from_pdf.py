#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Extract timetable courses from the provided PDF into schedule.json.

This relies on pdfplumber table extraction (the PDF has clear table lines).
"""

import json
import re
from pathlib import Path

import pdfplumber

PDF_PATH = Path(__file__).parent / "inbound" / "schedule.pdf"
OUT_PATH = Path(__file__).parent / "schedule.json"

SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "intersection_tolerance": 5,
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "edge_min_length": 20,
    "text_tolerance": 3,
}

COL_WEEKDAY = {
    2: 1,  # Mon
    3: 2,  # Tue
    4: 3,  # Wed
    5: 4,  # Thu
    6: 5,  # Fri
    7: 6,  # Sat
    8: 7,  # Sun
}


def clean(s: str) -> str:
    return " ".join((s or "").replace("\u00a0", " ").split()).strip()


def parse_cell(text: str):
    """Return dict with title, periods, weeks, location, teacher."""
    t = clean(text)
    if "节)" not in t or "(" not in t:
        return None

    # title: before first ★ or before first (
    title = t
    if "★" in title:
        title = title.split("★", 1)[0]
    if "(" in title:
        title = title.split("(", 1)[0]
    title = clean(title)

    m = re.search(r"\((\d+)-(\d+)节\)", t)
    if not m:
        return None
    p1, p2 = int(m.group(1)), int(m.group(2))

    # weeks: e.g. 2-13周 or 12-13周 right after )
    m2 = re.search(r"\)\s*([0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*)周", t)
    weeks = clean(m2.group(1)) if m2 else ""

    # location after 场地:
    m3 = re.search(r"场地:([^/]+)", t)
    location = clean(m3.group(1)) if m3 else ""

    # teacher after 教师:
    m4 = re.search(r"教师:([^/]+)", t)
    teacher = clean(m4.group(1)) if m4 else ""

    return {
        "title": title,
        "periods": list(range(p1, p2 + 1)),
        "weeks": weeks,
        "location": location,
        "teacher": teacher,
        "source": "PDF",
    }


def main():
    if not PDF_PATH.exists():
        raise SystemExit(f"Missing PDF: {PDF_PATH}")

    courses = []
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables(SETTINGS)
            if not tables:
                continue
            table = tables[0]
            for r in table:
                for col_idx, cell in enumerate(r):
                    if col_idx not in COL_WEEKDAY:
                        continue
                    if not cell:
                        continue
                    item = parse_cell(cell)
                    if not item:
                        continue
                    item["weekday"] = COL_WEEKDAY[col_idx]
                    courses.append(item)

    # Deduplicate (same title/weekday/periods/weeks/location)
    seen = set()
    unique = []
    for c in courses:
        key = (c["title"], c["weekday"], tuple(c["periods"]), c.get("weeks", ""), c.get("location", ""), c.get("teacher", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(c)

    unique.sort(key=lambda x: (x["weekday"], min(x["periods"]) if x["periods"] else 999, x["title"]))

    # Keep existing meta/periodTimes
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    else:
        existing = {}

    data = {
        "meta": existing.get("meta", {"tz": "Asia/Shanghai", "week1_monday": "2026-03-02"}),
        "periodTimes": existing.get("periodTimes", {}),
        "courses": unique,
    }

    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {len(unique)} courses -> {OUT_PATH}")


if __name__ == "__main__":
    main()
