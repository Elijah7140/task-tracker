import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { DurationTicks } from "../time/duration-ticks.js";
import { durationCodec } from "./duration-codec.js";
import type { SettingCodec } from "./setting-codec.js";

const negativeOffset = "Reminder offsets must be nonnegative.";

/** Nonnegative reminder offsets stored as ISO-8601 durations (§7.12). */
export const reminderOffsetCodec: SettingCodec<DurationTicks> = {
  parse(text) {
    const value = durationCodec.parse(text);
    if (value < 0n) {
      throw new SyntaxError(negativeOffset);
    }
    return value;
  },
  format(value) {
    if (value < 0n) {
      throw new MetadataRuleError(negativeOffset);
    }
    return durationCodec.format(value);
  },
};
