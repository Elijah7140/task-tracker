import type { CalendarEntry } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  buildCalendarDays,
  clipEntryToDay,
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
    kind: "due",
    date: MONDAY,
    startTime: null,
    scheduledStart: null,
    scheduledEnd: null,
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

function scheduled(start: string, end: string | null, title = "Block") {
  return entry({
    kind: "scheduled",
    title,
    date: start.slice(0, 10),
    startTime: start.slice(11),
    dueDate: null,
    scheduledStart: start,
    scheduledEnd: end,
  });
}

function at(time: string, date = MONDAY) {
  return `${date}T${time}:00`;
}

function clip(value: Entry, day = MONDAY): CalendarOccurrence {
  const occurrence = clipEntryToDay(value, day);
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
      scheduled(at("15:00"), null, "Afternoon block"),
      due(MONDAY, "Timed due", "09:00:00"),
      due(MONDAY, "All day"),
      scheduled(at("08:00"), null, "Early block"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.entry.title)).toEqual([
      "All day",
      "Early block",
      "Timed due",
      "Afternoon block",
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

  it("Orders the due entry of an item before its scheduled entry at the same time", () => {
    const both = {
      itemId: FIRST_ID,
      title: "Both",
      dueTime: "09:00:00",
      scheduledStart: at("09:00"),
    };
    const dueEntry = entry({ ...both, startTime: "09:00:00" });
    const block = entry({ ...both, kind: "scheduled", startTime: "09:00:00" });

    const day = buildDay(MONDAY, [block, dueEntry]);

    expect(day.entries.map((occurrence) => occurrence.entry.kind)).toEqual(["due", "scheduled"]);
  });
});

describe("clipEntryToDay", () => {
  it("Clips a schedule crossing midnight to each day", () => {
    const value = scheduled(at("23:00"), at("01:00", "2026-11-17"));

    const first = clip(value, MONDAY);
    const second = clip(value, "2026-11-17");

    expect(first.startMinutes).toBe(23 * 60);
    expect(second.startMinutes).toBe(0);
    expect(second.endMinutes).toBe(60);
  });

  it("Keeps a block ending exactly at midnight off the next day", () => {
    const value = scheduled(at("22:00"), at("00:00", "2026-11-17"));

    const first = clip(value, MONDAY);
    const second = clipEntryToDay(value, "2026-11-17");

    expect(first.endMinutes).toBe(24 * 60);
    expect(first.heightPx).toBe(2 * HOUR_HEIGHT);
    expect(second).toBeNull();
  });

  it("Makes a zero-length schedule at midnight a thirty-minute block", () => {
    const value = scheduled(at("00:00"), at("00:00"));

    const occurrence = clip(value);

    expect(occurrence.startMinutes).toBe(0);
    expect(occurrence.endMinutes).toBe(30);
    expect(occurrence.durationMinutes).toBe(30);
  });

  it("Continues a zero-length schedule just before midnight on the next day", () => {
    const value = scheduled(at("23:45"), at("23:45"));

    const first = clipEntryToDay(value, MONDAY);
    const second = clip(value, "2026-11-17");

    expect(first).not.toBeNull();
    expect(second.endMinutes).toBe(15);
  });

  it("Keeps the floating length of a block on a daylight-saving day", () => {
    const value = scheduled("2026-03-08T01:00:00", "2026-03-08T04:00:00");

    const occurrence = clip(value, "2026-03-08");

    expect(occurrence.durationMinutes).toBe(180);
    expect(occurrence.heightPx).toBe(3 * HOUR_HEIGHT);
    expect(occurrence.topPx).toBe(HOUR_HEIGHT);
  });

  it("Makes blocks and markers as tall as their real duration", () => {
    const tenMinutes = clip(scheduled(at("09:00"), at("09:10")));
    const noEnd = clip(scheduled(at("09:00"), null));
    const marker = clip(due(MONDAY, "Marker", "09:00:00"));

    expect(tenMinutes.heightPx).toBeCloseTo((10 * HOUR_HEIGHT) / 60, 6);
    expect(noEnd.heightPx).toBe(HOUR_HEIGHT / 2);
    expect(marker.heightPx).toBe(HOUR_HEIGHT / 2);
  });

  it("Moves a due marker at the end of the day up to fit inside it", () => {
    const late = clip(due(MONDAY, "Late", "23:59:00"));
    const evening = clip(due(MONDAY, "Evening", "23:00:00"));

    expect(late.topPx + late.heightPx).toBe(DAY_HEIGHT);
    expect(evening.topPx).toBe(23 * HOUR_HEIGHT);
  });

  it.each([
    [10, true],
    [30, true],
    [60, false],
  ])("Makes a %i-minute block compact: %s", (minutes, compact) => {
    const end = `${MONDAY}T${String(9 + Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

    const occurrence = clip(scheduled(at("09:00"), end));

    expect(occurrence.isCompact).toBe(compact);
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
    const marker = clip(due(MONDAY, "Call", "09:05:00"));
    const block = clip(scheduled(at("23:00"), at("01:00", "2026-11-17"), "Deploy"));

    expect(allDay.accessibleLabel).toBe("Report, due all day, Overdue");
    expect(marker.accessibleLabel).toBe("Call, due 09:05");
    expect(block.accessibleLabel).toBe("Deploy, scheduled 23:00 to 24:00");
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
  it("Keeps adjacent half-hour blocks from overlapping or splitting the width", () => {
    const entries = [
      scheduled(at("09:00"), at("09:30"), "First"),
      scheduled(at("09:30"), at("10:00"), "Second"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([1, 1]);
    const first = named(day, "First");
    expect(first.topPx + first.heightPx).toBe(named(day, "Second").topPx);
  });

  it("Keeps blocks closer than the old minimum height from overlapping", () => {
    const entries = [
      scheduled(at("09:00"), at("09:15"), "First"),
      scheduled(at("09:30"), at("09:45"), "Second"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([1, 1]);
  });

  it("Shares width between a late marker moved up and the block it now covers", () => {
    const entries = [
      scheduled(at("23:30"), at("00:00", "2026-11-17"), "Block"),
      due(MONDAY, "Marker", "23:59:00"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([0.5, 0.5]);
  });

  it("Splits the day width between overlapping blocks", () => {
    const entries = [scheduled(at("09:00"), at("11:00")), scheduled(at("09:30"), at("10:00"))];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([0.5, 0.5]);
    expect(day.entries.map((occurrence) => occurrence.leftFraction)).toEqual([0, 0.5]);
  });

  it("Groups overlaps transitively through a middle block", () => {
    const entries = [
      scheduled(at("09:00"), at("10:00"), "First"),
      scheduled(at("09:30"), at("11:00"), "Middle"),
      scheduled(at("10:30"), at("11:30"), "Last"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([0.5, 0.5, 0.5]);
    expect(named(day, "First").leftFraction).toBe(0);
    expect(named(day, "Middle").leftFraction).toBe(0.5);
    expect(named(day, "Last").leftFraction).toBe(0);
  });

  it("Keeps blocks that only touch from sharing width", () => {
    const entries = [
      scheduled(at("09:00"), at("10:00"), "Before"),
      scheduled(at("10:00"), at("11:00"), "After"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([1, 1]);
  });

  it("Splits the width evenly between blocks with identical starts", () => {
    const entries = ["A", "B", "C"].map((title) => scheduled(at("09:00"), at("10:00"), title));

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([
      1 / 3,
      1 / 3,
      1 / 3,
    ]);
    expect(day.entries.map((occurrence) => occurrence.leftFraction)).toEqual([0, 1 / 3, 2 / 3]);
  });

  it("Shares the column between a timed due marker and the block it overlaps", () => {
    const entries = [
      scheduled(at("09:00"), at("11:00"), "Block"),
      due(MONDAY, "Marker", "09:30:00"),
    ];

    const day = buildDay(MONDAY, entries);

    expect(day.entries.map((occurrence) => occurrence.widthFraction)).toEqual([0.5, 0.5]);
  });
});
