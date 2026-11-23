import { it, expect } from "vitest";
import { planCalendarMove, type CalendarMoveIntent } from "../../src/index.js";

const date = "2026-11-13";
const next = "2026-11-14";
const due = (time: string | null) => ({
  dueDate: Temporal.PlainDate.from(date),
  dueTime: time === null ? null : Temporal.PlainTime.from(time),
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
  const moved = planCalendarMove(due(time), { target });

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
  expect(planCalendarMove(due(time), { target })).toBeNull();
});
