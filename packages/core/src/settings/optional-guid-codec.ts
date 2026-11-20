import type { SettingCodec } from "./setting-codec.js";

const hyphenatedGuid = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i;

/**
 * Reads an optional identifier, where empty text means none, and returns it in
 * uppercase like every decoded GUID (§4). Writes lowercase hyphenated text, as
 * the legacy app's `Guid.ToString("D")` did, so either app can read the value.
 */
export const optionalGuidCodec: SettingCodec<string | null> = {
  parse(text) {
    const trimmed = text.trim();
    if (trimmed === "") {
      return null;
    }
    const match = hyphenatedGuid.exec(trimmed);
    if (match?.[1] === undefined) {
      throw new SyntaxError("Expected an identifier setting value.");
    }
    return match[1].toUpperCase();
  },
  format: (value) => value?.toLowerCase() ?? "",
};
