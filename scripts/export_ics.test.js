const test = require("node:test");
const assert = require("node:assert/strict");

const { buildICS } = require("./export_ics");

test("buildICS emits timezone-aware events and 30-minute alarms", () => {
  const schedule = {
    meta: {
      tz: "Asia/Shanghai",
      week1_monday: "2026-03-02",
    },
    periodTimes: {
      "1": "08:10-08:55",
      "2": "09:00-09:45",
    },
    courses: [
      {
        title: "测试课程",
        location: "测试教室",
        teacher: "张老师",
        weekday: 1,
        weeks: "1",
        periods: [1, 2],
      },
    ],
    special: [],
  };

  const ics = buildICS(schedule, []);

  assert.match(ics, /BEGIN:VTIMEZONE/);
  assert.match(ics, /TZID:Asia\/Shanghai/);
  assert.match(ics, /DTSTAMP:\d{8}T\d{6}Z/);
  assert.match(ics, /DTSTART;TZID=Asia\/Shanghai:20260302T081000/);
  assert.match(ics, /DTEND;TZID=Asia\/Shanghai:20260302T094500/);
  assert.match(ics, /TRIGGER:-PT30M/);
});
