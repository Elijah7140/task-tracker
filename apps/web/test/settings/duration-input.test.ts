import { describe, expect, it } from "vitest";
import {
  createDurationDraft,
  formatDurationAmount,
  parseDurationTicks,
  resolveDurationFieldTicks,
  validateThresholdTicks,
} from "../../src/settings/duration-input.js";

const DAY = "864000000000";
const THREE_DAYS = "2592000000000";
const ONE_AND_HALF_DAYS = "1296000000000";
const TWENTY_FOUR_HOURS = "864000000000";
const THIRTY_HOURS = "1080000000000";
const HALF_SECOND = "5000000";

describe("formatDurationAmount", () => {
  it("Formats whole day and hour tick counts without trailing decimals", () => {
    expect(formatDurationAmount(THREE_DAYS, "days")).toBe("3");
    expect(formatDurationAmount(TWENTY_FOUR_HOURS, "hours")).toBe("24");
    expect(formatDurationAmount("0", "hours")).toBe("0");
  });

  it("Formats fractional day and hour tick counts accurately", () => {
    expect(formatDurationAmount(ONE_AND_HALF_DAYS, "days")).toBe("1.5");
    expect(formatDurationAmount("18000000000", "hours")).toBe("0.5");
  });
});

describe("parseDurationTicks", () => {
  it("Converts nonnegative decimal amounts in days and hours to exact ticks", () => {
    expect(parseDurationTicks("3", "days")).toBe(THREE_DAYS);
    expect(parseDurationTicks(" 30 ", "hours")).toBe(THIRTY_HOURS);
    expect(parseDurationTicks("1.5", "days")).toBe(ONE_AND_HALF_DAYS);
    expect(parseDurationTicks("0", "hours")).toBe("0");
  });

  it("Rejects negative, non-numeric, blank and overflowing inputs", () => {
    expect(parseDurationTicks("", "days")).toBeNull();
    expect(parseDurationTicks("-1", "hours")).toBeNull();
    expect(parseDurationTicks("abc", "days")).toBeNull();
    expect(parseDurationTicks("999999999", "days")).toBeNull();
  });
});

describe("resolveDurationFieldTicks", () => {
  it("Preserves exact server ticks while the draft remains unedited", () => {
    const draft = createDurationDraft(HALF_SECOND, "hours");

    expect(resolveDurationFieldTicks(draft)).toBe(HALF_SECOND);
  });

  it("Recomputes ticks once the draft has been edited", () => {
    const edited = { text: "4", unit: "days" as const, exactTicks: null };

    expect(resolveDurationFieldTicks(edited)).toBe("3456000000000");
  });
});

describe("validateThresholdTicks", () => {
  it("Allows red thresholds less than or equal to yellow thresholds", () => {
    expect(validateThresholdTicks(THREE_DAYS, DAY)).toBeNull();
    expect(validateThresholdTicks(DAY, DAY)).toBeNull();
  });

  it("Reports when the red threshold exceeds the yellow threshold", () => {
    expect(validateThresholdTicks(THREE_DAYS, String(100n * 36_000_000_000n))).toBe(
      "Red threshold must be no greater than yellow.",
    );
  });

  it("Reports when either threshold input is invalid", () => {
    expect(validateThresholdTicks(null, DAY)).toBe(
      "Thresholds must be nonnegative numbers within range.",
    );
    expect(validateThresholdTicks(THREE_DAYS, null)).toBe(
      "Thresholds must be nonnegative numbers within range.",
    );
  });
});
