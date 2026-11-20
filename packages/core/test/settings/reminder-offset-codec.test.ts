import { describe, expect, it } from "@effect/vitest";
import { MetadataRuleError, reminderOffsetCodec } from "../../src/index.js";
import { ticksPerHour } from "../../src/time/duration-ticks.js";

describe("reminderOffsetCodec", () => {
  it("Round-trips nonnegative ISO-8601 durations", () => {
    const parsed = reminderOffsetCodec.parse("PT1H");

    expect(parsed).toBe(ticksPerHour);
    expect(reminderOffsetCodec.format(0n)).toBe("PT0S");
  });

  it("Refuses negative offsets when reading and writing", () => {
    expect(() => reminderOffsetCodec.parse("-PT1H")).toThrow(SyntaxError);
    expect(() => reminderOffsetCodec.format(-ticksPerHour)).toThrow(MetadataRuleError);
  });
});
