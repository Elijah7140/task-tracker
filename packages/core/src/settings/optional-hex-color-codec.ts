import { trimText } from "../text/dotnet-white-space.js";
import type { SettingCodec } from "./setting-codec.js";

const hexColor = /^#[0-9a-f]{6}$/i;

/**
 * Reads an optional `#rrggbb` color, where empty text means none so the theme's
 * own color applies (§6.3). Values are returned and written in lowercase.
 */
export const optionalHexColorCodec: SettingCodec<string | null> = {
  parse(text) {
    const trimmed = trimText(text);
    if (trimmed === "") {
      return null;
    }
    return checkHexColor(trimmed);
  },
  format: (value) => (value === null ? "" : checkHexColor(value)),
};

function checkHexColor(text: string): string {
  if (!hexColor.test(text)) {
    throw new SyntaxError("Expected a color in #rrggbb form.");
  }
  return text.toLowerCase();
}
