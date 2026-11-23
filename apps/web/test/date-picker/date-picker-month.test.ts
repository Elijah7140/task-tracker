import { describe, expect, it } from "vitest";
import {
  formatTypedDate,
  isInMonth,
  parseTypedDate,
  pickerKeyTarget,
  pickerMonthDays,
  shiftMonths,
} from "../../src/date-picker/date-picker-month.js";

const SUNDAY = 0;
const MONDAY = 1;

describe("parseTypedDate", () => {
  it.each([
    ["11/23/2026", "2026-11-23"],
    ["1/5/2026", "2026-01-05"],
    ["02/29/2028", "2028-02-29"],
    ["2026-11-23", "2026-11-23"],
    ["2026-1-5", "2026-01-05"],
    [" 2028-02-29 ", "2028-02-29"],
    ["", ""],
    ["   ", ""],
  ])("Reads %j as %j", (text, expected) => {
    const parsed = parseTypedDate(text);

    expect(parsed).toBe(expected);
  });

  it.each([
    "2026-11",
    "2026-13-01",
    "2026-02-29",
    "2026-11-31",
    "23/11/2026",
    "11/23/26",
    "tomorrow",
  ])("Rejects %j", (text) => {
    const parsed = parseTypedDate(text);

    expect(parsed).toBeNull();
  });
});

describe("formatTypedDate", () => {
  it.each([
    ["2026-11-23", "11/23/2026"],
    ["2027-01-05", "01/05/2027"],
    ["", ""],
  ])("Shows %j as %j", (isoDate, expected) => {
    const shown = formatTypedDate(isoDate);

    expect(shown).toBe(expected);
  });
});

describe("pickerMonthDays", () => {
  it("Lists six weeks starting on the locale's first day", () => {
    const sundayDays = pickerMonthDays("2026-11-23", SUNDAY);
    const mondayDays = pickerMonthDays("2026-11-23", MONDAY);

    expect(sundayDays).toHaveLength(42);
    expect(sundayDays[0]).toBe("2026-11-01");
    expect(mondayDays[0]).toBe("2026-10-26");
    expect(mondayDays.at(-1)).toBe("2026-12-06");
  });
});

describe("shiftMonths", () => {
  it.each([
    ["2026-11-23", 1, "2026-12-23"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-11-23", 12, "2027-11-23"],
  ])("Moves %s by %i months to %s", (date, months, expected) => {
    const shifted = shiftMonths(date, months);

    expect(shifted).toBe(expected);
  });
});

describe("isInMonth", () => {
  it("Tells days of the shown month from the neighbouring months' days", () => {
    const inside = isInMonth("2026-11-30", "2026-11-01");
    const outside = isInMonth("2026-12-01", "2026-11-01");

    expect(inside).toBe(true);
    expect(outside).toBe(false);
  });
});

describe("pickerKeyTarget", () => {
  it.each([
    ["ArrowLeft", false, "2026-11-24"],
    ["ArrowRight", false, "2026-11-26"],
    ["ArrowUp", false, "2026-11-18"],
    ["ArrowDown", false, "2026-12-02"],
    ["PageUp", false, "2026-10-25"],
    ["PageDown", false, "2026-12-25"],
    ["PageUp", true, "2025-11-25"],
    ["PageDown", true, "2027-11-25"],
    ["Home", false, "2026-11-22"],
    ["End", false, "2026-11-28"],
  ])("Moves %s (Shift %s) from Wednesday 25 November to %s", (key, shiftKey, expected) => {
    const target = pickerKeyTarget({ key, shiftKey }, "2026-11-25", SUNDAY);

    expect(target).toBe(expected);
  });

  it("Keeps Home and End within a Monday-first week", () => {
    const start = pickerKeyTarget({ key: "Home", shiftKey: false }, "2026-11-22", MONDAY);
    const end = pickerKeyTarget({ key: "End", shiftKey: false }, "2026-11-22", MONDAY);

    expect(start).toBe("2026-11-16");
    expect(end).toBe("2026-11-22");
  });

  it("Ignores keys the picker does not use", () => {
    const target = pickerKeyTarget({ key: "a", shiftKey: false }, "2026-11-25", SUNDAY);

    expect(target).toBeNull();
  });
});
