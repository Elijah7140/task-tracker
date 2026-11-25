import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  DEFAULT_CALENDAR_THRESHOLDS,
  MetadataRuleError,
  UrgencyThresholds,
  calculateCalendarEntryUrgency,
  validateCalendarRange,
  type CalendarEntry,
} from "../../src/index.js";
import { ticksPerHour } from "../../src/time/duration-ticks.js";

const NOW = Temporal.Instant.from("2026-11-13T12:00:00Z");
const TODAY = Temporal.PlainDate.from("2026-11-13");

function dueEntry(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime | null = null,
  overrides: Partial<CalendarEntry> = {},
): CalendarEntry {
  return {
    itemId: "0190A1B2-0000-7000-8000-000000000001",
    projectId: "0190A1B2-0000-7000-8000-000000000002",
    folderId: null,
    title: "Due item",
    date,
    startTime: time,
    isCompleted: false,
    dueDate: date,
    dueTime: time,
    priority: null,
    statusId: null,
    statusName: null,
    priorityLevelId: null,
    thresholds: DEFAULT_CALENDAR_THRESHOLDS,
    ...overrides,
  };
}

describe("DEFAULT_CALENDAR_THRESHOLDS", () => {
  it("Defaults thresholds to the application defaults", () => {
    const thresholds = DEFAULT_CALENDAR_THRESHOLDS;

    expect(thresholds.yellow).toBe(72n * ticksPerHour);
    expect(thresholds.red).toBe(24n * ticksPerHour);
  });
});

describe("validateCalendarRange", () => {
  it.effect("Accepts a range of one day", () =>
    Effect.gen(function* () {
      const from = Temporal.PlainDate.from("2026-11-01");

      yield* validateCalendarRange(from, from.add({ days: 1 }));
    }),
  );

  it.effect.each([
    ["zero-length", 0],
    ["reversed", -1],
  ] as const)("Rejects a %s range with a rule error", ([_label, days]) =>
    Effect.gen(function* () {
      const day = Temporal.PlainDate.from("2026-11-16");

      const error = yield* Effect.flip(validateCalendarRange(day, day.add({ days })));

      expect(error).toBeInstanceOf(MetadataRuleError);
      expect(error.message).toBe("Calendar range must have a positive length.");
    }),
  );
});

describe("calculateCalendarEntryUrgency", () => {
  it.each([
    [11, "Overdue"],
    [13, "Imminent"],
    [12 + 48, "Approaching"],
    [12 + 24 * 6, "None"],
  ] as const)("Gives a timed due entry %i hours into the day %s urgency", (hours, expected) => {
    const due = TODAY.toPlainDateTime().add({ hours });
    const entry = dueEntry(due.toPlainDate(), due.toPlainTime());

    const urgency = calculateCalendarEntryUrgency(entry, NOW, "UTC");

    expect(urgency).toBe(expected);
  });

  it("Uses the thresholds attached to the entry", () => {
    const narrow = new UrgencyThresholds(2n * ticksPerHour, ticksPerHour);
    const entry = dueEntry(TODAY, Temporal.PlainTime.from("18:00"), { thresholds: narrow });

    const urgency = calculateCalendarEntryUrgency(entry, NOW, "UTC");

    expect(urgency).toBe("None");
  });

  it("Gives a completed entry no urgency even when overdue", () => {
    const entry = dueEntry(TODAY.subtract({ days: 3 }), null, { isCompleted: true });

    const urgency = calculateCalendarEntryUrgency(entry, NOW, "UTC");

    expect(urgency).toBe("None");
  });

  it("Evaluates urgency in the time zone passed in", () => {
    const entry = dueEntry(TODAY, Temporal.PlainTime.from("20:00"));

    const urgency = calculateCalendarEntryUrgency(entry, NOW, "Asia/Tokyo");

    expect(urgency).toBe("Overdue");
  });

  it("Resolves a deadline in a daylight-saving gap to the transition", () => {
    const entry = dueEntry(Temporal.PlainDate.from("2026-03-08"), Temporal.PlainTime.from("02:30"));
    const zone = "America/New_York";
    const justBeforeTransition = Temporal.Instant.from("2026-03-08T06:59:59Z");
    const atTransition = Temporal.Instant.from("2026-03-08T07:00:00Z");
    const afterTransition = Temporal.Instant.from("2026-03-08T07:00:01Z");

    const before = calculateCalendarEntryUrgency(entry, justBeforeTransition, zone);
    const at = calculateCalendarEntryUrgency(entry, atTransition, zone);
    const after = calculateCalendarEntryUrgency(entry, afterTransition, zone);

    expect(before).toBe("Imminent");
    expect(at).toBe("Imminent");
    expect(after).toBe("Overdue");
  });

  it("Treats a date-only due date as due at the end of the local day", () => {
    const entry = dueEntry(TODAY);
    const lateEvening = Temporal.Instant.from("2026-11-13T23:59:59Z");
    const nextDay = Temporal.Instant.from("2026-11-14T00:00:00Z");

    const evening = calculateCalendarEntryUrgency(entry, lateEvening, "UTC");
    const following = calculateCalendarEntryUrgency(entry, nextDay, "UTC");

    expect(evening).toBe("Imminent");
    expect(following).toBe("Overdue");
  });
});
