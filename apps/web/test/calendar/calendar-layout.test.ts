import type { CalendarEntry } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  buildCalendarDays,
  entryOnDay,
  type CalendarDay,
  type CalendarOccurrence,
} from "../../src/calendar/calendar-layout.js";
import { DAY_HEIGHT, HOUR_HEIGHT } from "../../src/calendar/calendar-metrics.js";

type Entry = typeof CalendarEntry.Type;

const MONDAY = "2026-11-16";
const FIRST_ID = "00000000-0000-0000-0000-000000000001";
let nextId = 100;

function newId() {
  nextId += 1;
  return `0190A1B2-0000-7000-8000-${String(nextId).padStart(12, "0")}`;
}

function entry(overrides: Partial<Entry>): Entry {
  return {
    itemId: newId(),
    projectId: "0190A1B2-0000-7000-8000-000000000002",
    folderId: null,
    title: "Due item",
    date: MONDAY,
    startTime: null,
    isCompleted: false,
    dueDate: MONDAY,
    dueTime: null,
    itemType: null,
    priority: null,
    statusId: null,
    statusName: null,
    priorityLevelId: null,
    urgency: "None",
    ...overrides,
  };
}

function due(date: string, title = "Due item", time: string | null = null, extra = {}) {
  return entry({ date, dueDate: date, startTime: time, dueTime: time, title, ...extra });
}

/** A timed due marker on Monday at `time` (HH:mm). */
function marker(time: string, title = "Marker") {
  return due(MONDAY, title, `${time}:00`);
}

function clip(value: Entry, day = MONDAY): CalendarOccurrence {
  const occurrence = entryOnDay(value, day);
  if (occurrence === null) {
    throw new Error(`${value.title} is not on ${day}`);
  }
  return occurrence;
}

function buildDay(date: string, entries: ReadonlyArray<Entry>): CalendarDay {
  return buildCalendarDays(date, 1, date, date, entries, new Map(), "en-US")[0]!;
}

function named(day: CalendarDay, title: string): CalendarOccurrence {
  return day.entries.find((occurrence) => occurrence.entry.title === title)!;
}

describe("priority order within a day", () => {
  it("Lists all-day entries by priority rank, most important first and no priority last", () => {
    const ranks = new Map([
      ["0190A1B2-0000-7000-8000-00000000AAAA", 0],
      ["0190A1B2-0000-7000-8000-00000000BBBB", 1],
    ]);
    const entries = [
      due(MONDAY, "A no priority"),
      due(MONDAY, "B low", null, { priorityLevelId: "0190A1B2-0000-7000-8000-00000000BBBB" }),
      due(MONDAY, "C critical", null, { priorityLevelId: "0190A1B2-0000-7000-8000-00000000AAAA" }),
    ];

    const [day] = buildCalendarDays(MONDAY, 1, MONDAY, MONDAY, entries, ranks, "en-US");

    expect(day!.entries.map((occurrence) => occurrence.entry.title)).toEqual([
      "C critical",
      "B low",
      "A no priority",
    ]);
  });

  it("Keeps all-day entries ahead of timed ones whatever their priority", () => {
    const ranks = new Map([["0190A1B2-0000-7000-8000-00000000AAAA", 0]]);
    const entries = [
      due(MONDAY, "Timed critical", "09:00:00", {
        priorityLevelId: "0190A1B2-0000-7000-8000-00000000AAAA",
      }),
      due(MONDAY, "All day"),
    ];

    const [day] = buildCalendarDays(MONDAY, 1, MONDAY, MONDAY, entries, ranks, "en-US");

    expect(day!.entries.map((occurrence) => occurrence.entry.title)).toEqual([
      "All day",
      "Timed critical",
    ]);
  });
});

describe("buildCalendarDays", () => {
  it("Marks days outside the month and today", () => {
    const days = buildCalendarDays(
      "2026-11-01",
      42,
      "2026-11-13",
      "2026-11-13",
      [],
      new Map(),
      "en-US",
    );

    expect(days).toHaveLength(42);
    expect(days.filter((day) => !day.isOutsideMonth)).toHaveLength(30);
    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual(["2026-11-13"]);
  });

  it("Lists three entries in a month cell and counts the rest", () => {
    const entries = [1, 2, 3, 4, 5].map((number) => due("2026-11-13", `Item ${number}`));

    const day = buildDay("2026-11-13", entries);

    expect(day.visibleMonthEntries).toHaveLength(3);
    expect(day.moreCount).toBe(2);
  });

  it("Gives a month cell with exactly three entries no more link", () => {
    const entries = [1, 2, 3].map((number) => due("2026-11-13", `Item ${number}`));

    const day = buildDay("2026-11-13", entries);

    expect(day.visibleMonthEntries).toHaveLength(3);
    expect(day.moreCount).toBe(0);
  });

  it("Puts all-day entries before timed entries, then timed entries in start order", () => {
    const entries = [
      marker("15:00", "Afternoon"),
      due(MONDAY, "Timed due", "09:00:00"),
      due(MONDAY, "All day"),
      marker("08:00", "Early"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.entry.title)).toEqual([
      "All day",
      "Early",
      "Timed due",
      "Afternoon",
    ]);
    expect(day.allDayEntries.map((occurrence) => occurrence.entry.title)).toEqual(["All day"]);
    expect(day.timedEntries).toHaveLength(3);
  });

  it("Orders entries with the same start by title ignoring case", () => {
    const entries = [due(MONDAY, "banana"), due(MONDAY, "Cherry"), due(MONDAY, "Apple")];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.entry.title)).toEqual([
      "Apple",
      "banana",
      "Cherry",
    ]);
  });

  it("Orders entries with the same start and title by item id whatever the input order", () => {
    const low = due(MONDAY, "Same", null, { itemId: FIRST_ID });
    const high = due(MONDAY, "Same", null, { itemId: "00000000-0000-0000-0000-00000000000A" });

    const forward = buildDay(MONDAY, [low, high]);
    const backward = buildDay(MONDAY, [high, low]);

    const ids = [low.itemId, high.itemId];
    expect(forward.entries.map((occurrence) => occurrence.entry.itemId)).toEqual(ids);
    expect(backward.entries.map((occurrence) => occurrence.entry.itemId)).toEqual(ids);
  });
});

describe("entryOnDay", () => {
  it("Places a due entry on its due date only", () => {
    const value = due(MONDAY, "Report", "10:00:00");

    const onDay = clip(value);
    const nextDay = entryOnDay(value, "2026-11-17");

    expect(onDay.day).toBe(MONDAY);
    expect(onDay.startMinutes).toBe(10 * 60);
    expect(nextDay).toBeNull();
  });

  it("Makes a timed due marker thirty minutes tall and compact", () => {
    const timed = clip(marker("09:00"));
    const allDay = clip(due(MONDAY, "All day"));

    expect(timed.heightPx).toBe(HOUR_HEIGHT / 2);
    expect(timed.durationMinutes).toBe(30);
    expect(timed.isCompact).toBe(true);
    expect(allDay.isAllDay).toBe(true);
  });

  it("Moves a due marker at the end of the day up to fit inside it", () => {
    const late = clip(due(MONDAY, "Late", "23:59:00"));
    const evening = clip(due(MONDAY, "Evening", "23:00:00"));

    expect(late.topPx + late.heightPx).toBe(DAY_HEIGHT);
    expect(evening.topPx).toBe(23 * HOUR_HEIGHT);
  });

  it("Marks completed entries and leads month labels with the start time", () => {
    const done = clip(due(MONDAY, "Done", null, { isCompleted: true }));
    const timed = clip(due(MONDAY, "Timed", "09:05:00"));

    expect(done.label).toBe("✓ Done");
    expect(done.monthLabel).toBe("✓ Done");
    expect(timed.label).toBe("Timed");
    expect(timed.monthLabel).toBe("09:05 Timed");
  });

  it("Names type and priority in the tooltip with placeholders and adds the status", () => {
    const full = clip(due(MONDAY, "Full", null, { itemType: "Task", priority: "High" }));
    const bare = clip(due(MONDAY, "Bare"));
    const withStatus = clip(due(MONDAY, "Status", null, { statusName: "Blocked" }));

    expect(full.tooltip).toBe("Task · High");
    expect(bare.tooltip).toBe("No type · No priority");
    expect(withStatus.tooltip).toBe("No type · No priority · Blocked");
  });
});

describe("accessible names", () => {
  it("Names an entry with its title, timing on the day and urgency", () => {
    const allDay = clip(due(MONDAY, "Report", null, { urgency: "Overdue" }));
    const timed = clip(due(MONDAY, "Call", "09:05:00"));

    expect(allDay.accessibleLabel).toBe("Report, due all day, Overdue");
    expect(timed.accessibleLabel).toBe("Call, due 09:05");
  });

  it("Names each day with its full date and marks today", () => {
    const days = buildCalendarDays(MONDAY, 2, MONDAY, MONDAY, [], new Map(), "en-US");

    expect(days.map((day) => day.accessibleName)).toEqual([
      "Monday, November 16, 2026, today",
      "Tuesday, November 17, 2026",
    ]);
  });
});

describe("overlap placement", () => {
  it("Keeps adjacent half-hour markers from overlapping or splitting the width", () => {
    const entries = [marker("09:00", "First"), marker("09:30", "Second")];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([1, 1]);
    const first = named(day, "First");
    expect(first.topPx + first.heightPx).toBe(named(day, "Second").topPx);
  });

  it("Splits the day width between overlapping markers", () => {
    const entries = [marker("09:00", "First"), marker("09:15", "Second")];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([0.5, 0.5]);
    expect(day.entries.map((occurrence) => occurrence.leftFraction)).toEqual([0, 0.5]);
  });

  it("Shares width between a late marker moved up and the marker it now covers", () => {
    const entries = [marker("23:30", "Evening"), marker("23:59", "Late")];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([0.5, 0.5]);
  });

  it("Groups overlaps transitively through a middle marker", () => {
    const entries = [marker("09:00", "First"), marker("09:20", "Middle"), marker("09:40", "Last")];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([0.5, 0.5, 0.5]);
    expect(named(day, "First").leftFraction).toBe(0);
    expect(named(day, "Middle").leftFraction).toBe(0.5);
    expect(named(day, "Last").leftFraction).toBe(0);
  });

  it("Splits the width evenly between markers with identical starts", () => {
    const entries = ["A", "B", "C"].map((title) => marker("09:00", title));

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([
      1 / 3,
      1 / 3,
      1 / 3,
    ]);
    expect(day.entries.map((occurrence) => occurrence.leftFraction)).toEqual([0, 1 / 3, 2 / 3]);
  });
});
