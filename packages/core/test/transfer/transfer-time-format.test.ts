import { describe, expect, it } from "@effect/vitest";
import {
  formatTransferDate,
  formatTransferLocal,
  formatTransferTime,
  formatTransferUtc,
  parseTransferDate,
  parseTransferLocal,
  parseTransferTime,
  parseTransferUtc,
} from "../../src/index.js";

describe("transfer time format", () => {
  it("Formats dates, times and timestamps in the invariant ISO forms", () => {
    const date = Temporal.PlainDate.from("2026-11-13");
    const time = Temporal.PlainTime.from("15:30");

    const texts = [
      formatTransferDate(date),
      formatTransferTime(time),
      formatTransferLocal(date.toPlainDateTime(time)),
      formatTransferUtc(Temporal.Instant.from("2026-11-13T12:00:00Z")),
    ];

    expect(texts).toEqual([
      "2026-11-13",
      "15:30:00",
      "2026-11-13T15:30:00",
      "2026-11-13T12:00:00Z",
    ]);
  });

  it("Parses an ISO date and a local value with a space and rejects other cultures' forms", () => {
    const date = parseTransferDate("2026-11-13");
    const local = parseTransferLocal("2026-11-13 15:30");

    expect(date?.toString()).toBe("2026-11-13");
    expect(local?.toString()).toBe("2026-11-13T15:30:00");
    expect(parseTransferDate("13.11.2026")).toBeNull();
  });

  it("Keeps seven fractional digits through a round trip and drops trailing zeros", () => {
    const local = Temporal.PlainDateTime.from("2026-11-13T15:30:00.1234567");

    const text = formatTransferLocal(local);

    expect(text).toBe("2026-11-13T15:30:00.1234567");
    expect(parseTransferLocal(text)?.equals(local)).toBe(true);
    expect(formatTransferTime(Temporal.PlainTime.from("07:05:03.5"))).toBe("07:05:03.5");
  });

  it("Refuses a local value with an offset or Z", () => {
    const withZ = parseTransferLocal("2026-11-13T15:30:00Z");
    const withOffset = parseTransferLocal("2026-11-13T15:30:00+02:00");

    expect([withZ, withOffset]).toEqual([null, null]);
  });

  it("Needs the trailing Z and seconds on a UTC value", () => {
    const value = parseTransferUtc("2026-11-13T12:00:00Z");

    expect(parseTransferUtc("2026-11-13T12:00:00")).toBeNull();
    expect(parseTransferUtc("2026-11-13T12:00Z")).toBeNull();
    expect(value?.toString()).toBe("2026-11-13T12:00:00Z");
  });

  it("Accepts times without seconds and trims surrounding whitespace", () => {
    const short = parseTransferTime("15:30");
    const long = parseTransferTime(" 15:30:00 ");

    expect(short?.toString()).toBe("15:30:00");
    expect(long?.toString()).toBe("15:30:00");
  });

  it("Rejects impossible dates, hours and more than seven fraction digits", () => {
    const values = [
      parseTransferDate("2026-02-30"),
      parseTransferTime("24:00"),
      parseTransferTime("10:00:60"),
      parseTransferUtc("2026-11-13T12:00:00.12345678Z"),
      parseTransferDate("0000-01-01"),
    ];

    expect(values).toEqual([null, null, null, null, null]);
  });
});
