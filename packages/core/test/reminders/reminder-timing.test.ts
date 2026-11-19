import { describe, expect, it } from "@effect/vitest";
import {
  isReminderDue,
  itemReminderBase,
  itemReminderInstant,
  REMINDER_OFFSET_MINUTES,
  reminderBaseInstant,
  resolveReminderSettings,
  type ReminderChoice,
} from "../../src/index.js";
import { ticksPerMinute } from "../../src/time/duration-ticks.js";
import { item } from "../fixtures.js";

const noSettings = new Map<string, string>();
const offset = (minutes: number): ReminderChoice => ({ kind: "offset", minutes });

describe("reminderBaseInstant", () => {
  it.each([
    ["2026-03-08", "03:30", 60, "2026-03-08T07:00:00Z"],
    ["2026-11-01", "02:30", 60, "2026-11-01T05:30:00Z"],
  ])(
    "Resolves the reminder in the gap or the first repeated hour (%s %s)",
    (date, time, minutes, expected) => {
      const zone = "America/New_York";

      const instant = reminderBaseInstant(
        Temporal.PlainDate.from(date),
        Temporal.PlainTime.from(time),
        BigInt(minutes) * ticksPerMinute,
        zone,
      );

      expect(instant.toString()).toBe(expected);
    },
  );

  it("Subtracts the offset in local time before resolving the zone", () => {
    const zone = "America/New_York";

    const instant = reminderBaseInstant(
      Temporal.PlainDate.from("2026-03-09"),
      Temporal.PlainTime.from("02:30"),
      1440n * ticksPerMinute,
      zone,
    );

    expect(instant.toString()).toBe("2026-03-08T07:00:00Z");
  });
});

describe("itemReminderBase", () => {
  it("Uses the project time and the global default offset for a date-only item", () => {
    const dated = item("A", { dueDate: Temporal.PlainDate.from("2026-11-17") });
    const global = new Map([["defaultReminderOffset", "PT2H"]]);
    const project = new Map([["dateOnlyReminderTime", "10:30"]]);
    const settings = resolveReminderSettings(global, project);

    const instant = itemReminderBase(dated, settings, "Etc/GMT-2");

    expect(instant?.toString()).toBe("2026-11-17T06:30:00Z");
    expect(settings.dateOnlyReminderTime.source).toBe("Project");
    expect(settings.defaultReminderOffset.source).toBe("Global");
    const disabled = new Map([...project, ["remindersEnabled", "false"]]);
    expect(itemReminderBase(dated, resolveReminderSettings(global, disabled), "UTC")).toBeNull();
  });

  it.each(REMINDER_OFFSET_MINUTES)(
    "An explicit offset of %i minutes overrides the project default",
    (minutes) => {
      const timed = item("A", {
        dueDate: Temporal.PlainDate.from("2026-11-17"),
        dueTime: Temporal.PlainTime.from("09:30"),
        reminder: offset(minutes),
      });
      const settings = resolveReminderSettings(
        noSettings,
        new Map([["defaultReminderOffset", "PT3H"]]),
      );

      const instant = itemReminderBase(timed, settings, "UTC");

      const due = Temporal.Instant.from("2026-11-17T09:30:00Z");
      expect(instant?.toString()).toBe(due.subtract({ minutes }).toString());
    },
  );

  it("Ignores items that are done, deleted, undated or set to no reminder", () => {
    const dueDate = Temporal.PlainDate.from("2026-11-17");
    const settings = resolveReminderSettings(noSettings, noSettings);
    const done = item("A", { dueDate, completedAtUtc: Temporal.Instant.from("2026-11-17T00:00Z") });
    const deleted = item("B", {
      dueDate,
      deletedAtUtc: Temporal.Instant.from("2026-11-17T00:00Z"),
    });
    const undated = item("C");
    const silenced = item("D", { dueDate, reminder: { kind: "none" } });

    const instants = [done, deleted, undated, silenced].map((candidate) =>
      itemReminderBase(candidate, settings, "UTC"),
    );

    expect(instants).toEqual([null, null, null, null]);
  });

  it("Falls back to defaults for malformed stored reminder settings", () => {
    const dated = item("A", { dueDate: Temporal.PlainDate.from("2026-11-16") });
    const global = new Map([["defaultReminderOffset", "not a duration"]]);
    const project = new Map([
      ["dateOnlyReminderTime", "25:99"],
      ["remindersEnabled", "maybe"],
    ]);

    const instant = itemReminderBase(dated, resolveReminderSettings(global, project), "UTC");

    expect(instant?.toString()).toBe("2026-11-16T08:00:00Z");
  });
});

describe("itemReminderInstant", () => {
  it("A changed instant re-arms a delivered reminder", () => {
    const settings = resolveReminderSettings(noSettings, noSettings);
    const dueDate = Temporal.PlainDate.from("2026-11-17");
    const before = item("A", { dueDate, dueTime: Temporal.PlainTime.from("08:00") });
    const old = itemReminderBase(before, settings, "UTC")!;

    const after = { ...before, dueTime: Temporal.PlainTime.from("08:30") };
    const updated = itemReminderBase(after, settings, "UTC")!;

    expect(isReminderDue(old, updated, old)).toBe(false);
    expect(isReminderDue(updated, updated, old)).toBe(true);
  });

  it("A snooze replaces only the base instant it deferred", () => {
    const base = Temporal.Instant.from("2026-11-17T08:00:00Z");
    const until = Temporal.Instant.from("2026-11-17T08:10:00Z");
    const snooze = { snoozedForUtc: base, snoozedUntilUtc: until };

    const deferred = itemReminderInstant(base, snooze);
    const rearmed = itemReminderInstant(base.add({ hours: 1 }), snooze);

    expect(deferred?.toString()).toBe(until.toString());
    expect(rearmed?.toString()).toBe("2026-11-17T09:00:00Z");
    expect(itemReminderInstant(null, snooze)).toBeNull();
  });
});
