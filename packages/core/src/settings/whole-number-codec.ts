import type { SettingCodec } from "./setting-codec.js";

/** Read and write an invariant whole number bounded to `[min, max]`. */
export function wholeNumberCodec(min: number, max: number): SettingCodec<number> {
  const checkRange = (value: number) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new RangeError(`Expected a whole number between ${min} and ${max}.`);
    }
    return value;
  };
  return {
    parse(text) {
      const trimmed = text.trim();
      if (!/^-?\d+$/.test(trimmed)) {
        throw new SyntaxError("Expected a whole number setting value.");
      }
      return checkRange(Number(trimmed));
    },
    format(value) {
      return String(checkRange(value));
    },
  };
}
