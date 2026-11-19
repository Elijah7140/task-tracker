import { describe, expect, it } from "@effect/vitest";
import { localTimeCodec } from "../../src/index.js";

describe("localTimeCodec", () => {
  it.each([
    ["09:00", "09:00:00"],
    ["10:30:15", "10:30:15"],
    ["09:00:17.5", "09:00:17.5000000"],
  ])("Parses %s", (text, expected) => {
    const time = localTimeCodec.parse(text);

    expect(time.toString({ fractionalSecondDigits: text.includes(".") ? 7 : 0 })).toBe(expected);
  });

  it.each(["25:00", "9:00", "09:60", " 09:00", "09:00:00.12345678", "nine"])(
    "Refuses %s",
    (text) => {
      const attempt = () => localTimeCodec.parse(text);

      expect(attempt).toThrow(SyntaxError);
    },
  );

  it("Formats whole seconds without a fraction and keeps tick fractions", () => {
    const whole = localTimeCodec.format(Temporal.PlainTime.from("09:00"));
    const fractional = localTimeCodec.format(Temporal.PlainTime.from("09:00:00.1234567"));

    expect(whole).toBe("09:00:00");
    expect(fractional).toBe("09:00:00.1234567");
  });
});
