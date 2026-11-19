import type { SettingCodec } from "./setting-codec.js";

const timePattern = /^([01][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9])(?:\.([0-9]{1,7}))?)?$/u;
const nanosecondsPerTick = 100;

function parse(text: string): Temporal.PlainTime {
  const match = timePattern.exec(text);
  if (match === null) {
    throw new SyntaxError("Expected a local time in HH:mm or HH:mm:ss format.");
  }
  const [, hour, minute, second = "0", fraction = ""] = match;
  const ticks = Number(fraction.padEnd(7, "0"));
  return Temporal.PlainTime.from({
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    nanosecond: (ticks * nanosecondsPerTick) % 1000,
    microsecond: Math.floor((ticks * nanosecondsPerTick) / 1000) % 1000,
    millisecond: Math.floor((ticks * nanosecondsPerTick) / 1_000_000),
  });
}

function format(time: Temporal.PlainTime): string {
  const whole = time.toString({ fractionalSecondDigits: 0, roundingMode: "trunc" });
  const nanoseconds = time.millisecond * 1_000_000 + time.microsecond * 1000 + time.nanosecond;
  const ticks = Math.floor(nanoseconds / nanosecondsPerTick);
  return ticks === 0 ? whole : `${whole}.${String(ticks).padStart(7, "0").replace(/0+$/u, "")}`;
}

/**
 * Local wall-clock times as invariant 24-hour text, matching the legacy
 * `HH:mm`, `HH:mm:ss` and `HH:mm:ss.FFFFFFF` formats.
 */
export const localTimeCodec: SettingCodec<Temporal.PlainTime> = { parse, format };
