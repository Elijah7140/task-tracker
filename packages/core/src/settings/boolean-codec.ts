import type { SettingCodec } from "./setting-codec.js";

/** Read legacy case-insensitive Boolean text and write lowercase invariant text. */
export const booleanCodec: SettingCodec<boolean> = {
  parse(text) {
    switch (text.replace(/^[\p{White_Space}\0]+|[\p{White_Space}\0]+$/gu, "").toLowerCase()) {
      case "true":
        return true;
      case "false":
        return false;
      default:
        throw new SyntaxError("Expected a Boolean setting value.");
    }
  },
  format: (value) => (value ? "true" : "false"),
};
