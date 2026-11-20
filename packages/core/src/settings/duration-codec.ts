import {
  ticksPerDay,
  ticksPerHour,
  ticksPerMinute,
  ticksPerSecond,
  type DurationTicks,
} from "../time/duration-ticks.js";
import type { SettingCodec } from "./setting-codec.js";

const durationPattern = new RegExp(
  [
    "^(?<negative>-)?P(?=[0-9T])",
    "(?:(?<years>[0-9]+)Y)?(?:(?<months>[0-9]+)M)?(?:(?<days>[0-9]+)D)?",
    "(?:T(?=[0-9.])(?:(?<hours>[0-9]+)H)?(?:(?<minutes>[0-9]+)M)?",
    String.raw`(?:(?=[0-9.])(?<seconds>[0-9]*)(?:\.(?<fraction>[0-9]*))?S)?)?$`,
  ].join(""),
  "u",
);
const maxComponent = 2_147_483_647n;
const minTicks = -(2n ** 63n);
const maxTicks = 2n ** 63n - 1n;

function parseComponent(text: string | undefined): bigint {
  const value = BigInt(text ?? "0");
  if (value > maxComponent) {
    throw new SyntaxError("Expected an ISO-8601 duration.");
  }
  return value;
}

function requireTimeSpanRange(ticks: DurationTicks): DurationTicks {
  if (ticks < minTicks || ticks > maxTicks) {
    throw new RangeError("Duration is outside the .NET TimeSpan range.");
  }
  return ticks;
}

function parse(text: string): DurationTicks {
  const parts = durationPattern.exec(
    text.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ""),
  )?.groups;
  if (parts === undefined) {
    throw new SyntaxError("Expected an ISO-8601 duration.");
  }

  // XmlConvert counts each full year as 365 days and each remaining month as 30 days.
  const months = parseComponent(parts.months);
  const days =
    (parseComponent(parts.years) + months / 12n) * 365n +
    (months % 12n) * 30n +
    parseComponent(parts.days);
  const fraction = BigInt((parts.fraction ?? "").slice(0, 7).padEnd(7, "0"));
  const ticks =
    days * ticksPerDay +
    parseComponent(parts.hours) * ticksPerHour +
    parseComponent(parts.minutes) * ticksPerMinute +
    parseComponent(parts.seconds) * ticksPerSecond +
    fraction;

  return requireTimeSpanRange(parts.negative === undefined ? ticks : -ticks);
}

function format(ticks: DurationTicks): string {
  requireTimeSpanRange(ticks);
  if (ticks === 0n) {
    return "PT0S";
  }

  const magnitude = ticks < 0n ? -ticks : ticks;
  const days = magnitude / ticksPerDay;
  const hours = (magnitude % ticksPerDay) / ticksPerHour;
  const minutes = (magnitude % ticksPerHour) / ticksPerMinute;
  const seconds = (magnitude % ticksPerMinute) / ticksPerSecond;
  const fraction = magnitude % ticksPerSecond;

  let time = part(hours, "H") + part(minutes, "M");
  if (fraction > 0n) {
    time += `${seconds}.${fraction.toString().padStart(7, "0").replace(/0+$/, "")}S`;
  } else {
    time += part(seconds, "S");
  }

  return `${ticks < 0n ? "-" : ""}P${part(days, "D")}${time === "" ? "" : `T${time}`}`;
}

function part(value: bigint, unit: string): string {
  return value === 0n ? "" : `${value}${unit}`;
}

/** Parse and format the duration text used by .NET XmlConvert for TimeSpan values. */
export const durationCodec: SettingCodec<DurationTicks> = { parse, format };
