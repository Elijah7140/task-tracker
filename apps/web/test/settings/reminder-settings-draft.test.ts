import { describe, expect, it } from "vitest";
import {
  defaultOffsetOptions,
  displayTime,
  normalizeTime,
  reminderDefaultsFrom,
  sameReminderDefaults,
} from "../../src/settings/reminder-settings-draft.js";

const HOUR = "36000000000";

describe("reminder times", () => {
  it("Shows whole minutes without seconds and keeps seconds that are set", () => {
    const shown = [displayTime("09:00:00"), displayTime("09:00:17")];

    expect(shown).toEqual(["09:00", "09:00:17"]);
  });

  it("Normalizes typed times and refuses text that is not a time", () => {
    const normalized = ["08:30", "08:30:15", "", "25:00"].map(normalizeTime);

    expect(normalized).toEqual(["08:30:00", "08:30:15", null, null]);
  });
});

describe("reminderDefaultsFrom", () => {
  it("Builds the saved defaults, or null while the time is empty", () => {
    const valid = reminderDefaultsFrom({ enabled: false, offset: HOUR, time: "10:00" });
    const empty = reminderDefaultsFrom({ enabled: true, offset: HOUR, time: "" });

    expect(valid).toEqual({
      remindersEnabled: false,
      defaultReminderOffset: HOUR,
      dateOnlyReminderTime: "10:00:00",
    });
    expect(empty).toBeNull();
  });

  it("Compares times in either form", () => {
    const left = {
      remindersEnabled: true,
      defaultReminderOffset: HOUR,
      dateOnlyReminderTime: "09:00",
    };
    const right = { ...left, dateOnlyReminderTime: "09:00:00" };

    expect(sameReminderDefaults(left, right)).toBe(true);
  });
});

describe("defaultOffsetOptions", () => {
  it("Adds an unlisted stored offset as its own option", () => {
    const listed = defaultOffsetOptions(HOUR);
    const unlisted = defaultOffsetOptions(String(45n * 600_000_000n));

    expect(listed).toHaveLength(9);
    expect(unlisted.at(-1)).toEqual({ value: "27000000000", label: "45 minutes before" });
  });
});
