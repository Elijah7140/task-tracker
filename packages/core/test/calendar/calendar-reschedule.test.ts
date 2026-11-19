import { it, expect } from "vitest";
import { planCalendarMove, type CalendarMoveIntent } from "../../src/index.js";

const date = "2026-11-13";
const next = "2026-11-14";
const due = (time: string | null) => ({
  dueDate: Temporal.PlainDate.from(date),
  dueTime: time === null ? null : Temporal.PlainTime.from(time),
  scheduledStart: null,
  scheduledEnd: null,
});
const schedule = (start: string, end: string | null) => ({
  dueDate: null,
  dueTime: null,
  scheduledStart: Temporal.PlainDateTime.from(start),
  scheduledEnd: end === null ? null : Temporal.PlainDateTime.from(end),
});
type Target = CalendarMoveIntent["target"];

it.each<[string, string | null, Target, string, string | null]>([
  ["keeps the time on a month drop", "10:07", { type: "month", date: next }, next, "10:07:00"],
  [
    "keeps an all-day entry all-day on a month drop",
    null,
    { type: "month", date: next },
    next,
    null,
  ],
  [
    "moves an all-day entry to another week cell",
    null,
    { type: "all-day", date: next },
    next,
    null,
  ],
  [
    "makes an all-day entry timed",
    null,
    { type: "time", date: next, minute: 600 },
    next,
    "10:00:00",
  ],
  [
    "resets the day and time of a timed due entry",
    "10:07",
    { type: "time", date: next, minute: 630 },
    next,
    "10:30:00",
  ],
  ["clears the time of a timed due entry", "10:07", { type: "all-day", date: next }, next, null],
  ["steps an all-day entry forward", null, { type: "step", days: 1, quarters: 0 }, next, null],
  [
    "steps a timed entry backward by a day",
    "10:07",
    { type: "step", days: -1, quarters: 0 },
    "2026-11-12",
    "10:07:00",
  ],
  [
    "steps a timed entry forward by a quarter",
    "10:00",
    { type: "step", days: 0, quarters: 1 },
    date,
    "10:15:00",
  ],
  [
    "steps a timed entry backward by a quarter",
    "10:00",
    { type: "step", days: 0, quarters: -1 },
    date,
    "09:45:00",
  ],
  [
    "snaps forward from between quarters",
    "10:07",
    { type: "step", days: 0, quarters: 1 },
    date,
    "10:15:00",
  ],
  [
    "snaps backward from between quarters",
    "10:07",
    { type: "step", days: 0, quarters: -1 },
    date,
    "10:00:00",
  ],
  [
    "snaps backward from just after a quarter",
    "10:00:00.0000001",
    { type: "step", days: 0, quarters: -1 },
    date,
    "10:00:00",
  ],
  ["adds several quarter steps", "10:07", { type: "step", days: 0, quarters: 3 }, date, "10:45:00"],
  [
    "clamps forward at the last quarter",
    "23:30",
    { type: "step", days: 0, quarters: 2 },
    date,
    "23:45:00",
  ],
  [
    "clamps backward at midnight",
    "00:15",
    { type: "step", days: 0, quarters: -2 },
    date,
    "00:00:00",
  ],
  [
    "snaps back from the end of the day",
    "23:50",
    { type: "step", days: 0, quarters: -1 },
    date,
    "23:45:00",
  ],
])("A due move %s", (_name, time, target, expectedDate, expectedTime) => {
  const moved = planCalendarMove(due(time), { kind: "due", sourceDay: date, target });

  expect(moved?.date.toString()).toBe(expectedDate);
  expect(moved?.dates.dueTime?.toString() ?? null).toBe(expectedTime);
});

it.each<[string | null, Target]>([
  [null, { type: "month", date }],
  [null, { type: "all-day", date }],
  [null, { type: "step", days: 0, quarters: 1 }],
  ["10:15", { type: "time", date, minute: 615 }],
  ["00:00", { type: "step", days: 0, quarters: -1 }],
  ["23:45", { type: "step", days: 0, quarters: 1 }],
])("Leaves a due entry at %s unchanged for %j", (time, target) => {
  expect(planCalendarMove(due(time), { kind: "due", sourceDay: date, target })).toBeNull();
});

it.each<[string, string, Target, string | null]>([
  [
    "moves by whole days from the first day",
    date,
    { type: "month", date: next },
    "2026-11-14T23:00:00",
  ],
  [
    "moves by whole days from the second day",
    next,
    { type: "month", date: "2026-11-15" },
    "2026-11-14T23:00:00",
  ],
  [
    "places the first segment at the snapped time",
    date,
    { type: "time", date: next, minute: 600 },
    "2026-11-14T10:00:00",
  ],
  [
    "places the continuation at the snapped time",
    next,
    { type: "time", date: next, minute: 45 },
    "2026-11-13T23:45:00",
  ],
  ["ignores an all-day drop", date, { type: "all-day", date: next }, null],
  ["ignores a drop in the same time slot", date, { type: "time", date, minute: 1380 }, null],
  [
    "ignores a drop in the same continuation slot",
    next,
    { type: "time", date: next, minute: 0 },
    null,
  ],
  [
    "can move by a day and quarter together",
    date,
    { type: "step", days: 1, quarters: 1 },
    "2026-11-14T23:15:00",
  ],
  [
    "nudges from the clipped start",
    next,
    { type: "step", days: 0, quarters: 1 },
    "2026-11-13T23:15:00",
  ],
  ["clamps a continuation at midnight", next, { type: "step", days: 0, quarters: -1 }, null],
  [
    "can step the continuation to the prior day",
    next,
    { type: "step", days: -1, quarters: 0 },
    "2026-11-12T23:00:00",
  ],
])("An overnight block %s", (_name, sourceDay, target, expected) => {
  const dates = schedule("2026-11-13T23:00", "2026-11-14T01:00");

  const moved = planCalendarMove(dates, { kind: "scheduled", sourceDay, target });

  expect(moved?.dates.scheduledStart?.toString() ?? null).toBe(expected);
  if (moved !== null) {
    expect(moved.dates.scheduledStart?.until(moved.dates.scheduledEnd!).toString()).toBe("PT2H");
  }
});
