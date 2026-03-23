#!/usr/bin/env node
// -*- coding: utf-8 -*-

const fs = require('fs');
const path = require('path');

/**
 * Parse week specification like "1-15", "2-17", "12-13", "1,3,5-7"
 * @param {string} spec - Week specification
 * @returns {Set<number>} - Set of week numbers
 */
function parseWeekSpec(spec) {
    const weeks = new Set();
    const parts = String(spec).replace(/，/g, ',').split(',');

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        if (trimmed.includes('-')) {
            const [a, b] = trimmed.split('-', 2).map(x => parseInt(x.trim(), 10));
            const start = Math.min(a, b);
            const end = Math.max(a, b);
            for (let i = start; i <= end; i++) {
                weeks.add(i);
            }
        } else {
            weeks.add(parseInt(trimmed, 10));
        }
    }

    return weeks;
}

/**
 * Calculate week number from a given date
 * @param {Date} d - Target date
 * @param {Date} week1Monday - Date of week 1 Monday
 * @returns {number} - Week number
 */
function weekNumber(d, week1Monday) {
    const deltaDays = Math.floor((d - week1Monday) / (1000 * 60 * 60 * 24));
    return Math.floor(deltaDays / 7) + 1;
}

/**
 * Get weekday in 1-7 format (Monday=1, Sunday=7)
 * @param {Date} d - Date
 * @returns {number} - Weekday number
 */
function weekday1To7(d) {
    // JavaScript: Sunday=0, Monday=1, ..., Saturday=6
    // Convert to: Monday=1, ..., Sunday=7
    return d.getDay() === 0 ? 7 : d.getDay();
}

/**
 * Load JSON data from file
 * @param {string} filePath - Path to JSON file
 * @returns {object} - Parsed JSON
 */
function loadData(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
}

/**
 * Get default schedule.json path
 * Priority:
 * 1) env TIMETABLE_SCHEDULE
 * 2) ./data/schedule.json (new layout)
 * 3) ./schedule.json (legacy)
 * @returns {string} - Path to schedule file
 */
function defaultSchedulePath() {
    const envPath = (process.env.TIMETABLE_SCHEDULE || '').trim();
    if (envPath) return envPath;
    if (fs.existsSync('data/schedule.json')) return 'data/schedule.json';
    return 'schedule.json';
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 * @param {Date} d - Date
 * @returns {string} - ISO date string (local date)
 */
function formatDay(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Parse date from ISO string
 * @param {string} isoString - ISO date string
 * @returns {Date} - Date object (local time at midnight)
 */
function parseDate(isoString) {
    // Handle YYYY-MM-DD format - treat as local date, not UTC
    const [year, month, day] = isoString.split('-').map(Number);
    // Use explicit local timezone construction to avoid UTC shift
    return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Main function
 * @param {string[]} argv - Command line arguments
 * @returns {number} - Exit code
 */
function main(argv) {
    if (argv.length < 3) {
        console.log("Usage: schedule.js today|YYYY-MM-DD");
        return 2;
    }

    const arg = argv[2].trim().toLowerCase();

    const schedulePath = defaultSchedulePath();
    if (!fs.existsSync(schedulePath)) {
        console.log(`Missing schedule file: ${schedulePath}`);
        console.log("\nHow to prepare data:");
        console.log("1) Put your timetable PDF at: inbound/schedule.pdf (do NOT commit it)");
        console.log("2) Run: node scripts/extract_from_pdf.js");
        console.log("3) It will generate: data/schedule.json");
        console.log("\nOr set TIMETABLE_SCHEDULE=/path/to/schedule.json");
        return 2;
    }

    const data = loadData(schedulePath);
    const tz = data.meta?.tz || 'Asia/Shanghai';
    const week1 = parseDate(data.meta?.week1_monday || '2026-03-02');

    let d;
    if (arg === 'today') {
        // Get today's date in the specified timezone
        const now = new Date();
        // Format as YYYY-MM-DD in target timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(now);
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
        d = parseDate(argv[2]);
    }

    const wno = weekNumber(d, week1);
    const wday = weekday1To7(d);

    // Load courses
    const courses = (data.courses || []).map(c => ({
        title: c.title || '',
        weekday: parseInt(c.weekday, 10),
        periods: Array.isArray(c.periods) ? c.periods : [],
        weeks: String(c.weeks || '').trim(),
        location: c.location || '',
        teacher: c.teacher || ''
    }));

    const matches = [];
    for (const c of courses) {
        if (c.weekday !== wday) continue;
        if (!parseWeekSpec(c.weeks).has(wno)) continue;
        matches.push(c);
    }

    // Special (non-period) items, e.g. practice week
    const specials = [];
    for (const s of data.special || []) {
        const weeks = String(s.weeks || '').trim();
        if (weeks && !parseWeekSpec(weeks).has(wno)) continue;

        const wdays = s.weekday;
        let okDay = false;
        if (typeof wdays === 'number') {
            okDay = (wdays === wday);
        } else if (Array.isArray(wdays)) {
            okDay = wdays.map(x => parseInt(x, 10)).includes(wday);
        }
        if (!okDay) continue;

        specials.push(s);
    }

    // Sort by first period
    matches.sort((a, b) => {
        const aMin = a.periods.length > 0 ? Math.min(...a.periods) : 999;
        const bMin = b.periods.length > 0 ? Math.min(...b.periods) : 999;
        if (aMin !== bMin) return aMin - bMin;
        return a.title.localeCompare(b.title);
    });

    const periodTimes = {};
    if (data.periodTimes) {
        for (const [k, v] of Object.entries(data.periodTimes)) {
            periodTimes[parseInt(k, 10)] = v;
        }
    }

    // Output
    const weekdays = ['', '一', '二', '三', '四', '五', '六', '日'];
    console.log(`${formatDay(d)}（第${wno}周 周${weekdays[wday]}）`);

    if (matches.length === 0 && specials.length === 0) {
        console.log("今天没有课");
        return 0;
    }

    // Print specials first (time-range items)
    const specialTimeWindows = new Set();
    for (const s of specials) {
        const title = s.title || '';
        const loc = s.location || "(地点待补)";
        for (const t of s.times || []) {
            const st = t.start || '';
            const ed = t.end || '';
            if (st && ed) {
                specialTimeWindows.add(`${st.trim()}-${ed.trim()}`);
            }
            const ttxt = `${st}-${ed}`.replace(/^-|-$/g, '');
            console.log(`- ${ttxt}｜${title}｜${loc}`);
        }
    }

    // If a special item shares the same time window with a normal course, treat it as an override
    for (const c of matches) {
        const ps = c.periods;
        let ptxt, ttxt;

        if (ps && ps.length > 0) {
            ptxt = ps.length === 1 ? `${ps[0]}` : `${ps[0]}-${ps[ps.length - 1]}`;

            if (ps.length === 1) {
                ttxt = periodTimes[ps[0]] || '';
            } else {
                const first = periodTimes[ps[0]] || '';
                const last = periodTimes[ps[ps.length - 1]] || '';

                // Expect "HH:MM-HH:MM"; fall back to raw strings if format differs
                if (first.includes('-') && last.includes('-')) {
                    const start = first.split('-', 2)[0].trim();
                    const end = last.split('-', 2)[1].trim();
                    ttxt = (start && end) ? `${start}-${end}` : `${first}~${last}`.replace(/~$/, '');
                } else {
                    ttxt = `${first}~${last}`.replace(/~$/, '');
                }
            }
        } else {
            ptxt = "?";
            ttxt = "";
        }

        // Override check
        if (ttxt && ttxt.includes('-')) {
            const [st, ed] = ttxt.split('-', 2).map(x => x.trim());
            if (specialTimeWindows.has(`${st}-${ed}`)) {
                continue;
            }
        }

        const loc = c.location || "(地点待补)";
        console.log(`- 第${ptxt}节 ${ttxt}｜${c.title}｜${loc}`);
    }

    return 0;
}

// Run main
if (require.main === module) {
    process.exit(main(process.argv));
}

// Export for testing
module.exports = { parseWeekSpec, weekNumber, weekday1To7 };
