/**
 * Text helpers that treat white space exactly as the legacy .NET app did
 * (`string.Trim`, `string.IsNullOrWhiteSpace` and `string.Split(null)`), so names,
 * titles, labels and other user text keep the same characters in both apps.
 *
 * .NET's `char.IsWhiteSpace` set is U+0009–U+000D, U+0085 and the Unicode space,
 * line and paragraph separators (Zs, Zl, Zp): the Unicode White_Space property.
 * JavaScript's `trim()` and `\s` differ: they also remove U+FEFF (byte-order mark)
 * and keep U+0085 (next line). Neither set includes U+200B (zero-width space).
 */

const SPACE = String.raw`\u0009-\u000d\u0085\p{Z}`;
const SURROUNDING = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "gu");
const TRAILING = new RegExp(`[${SPACE}]+$`, "u");
const RUN = new RegExp(`[${SPACE}]+`, "u");
const BLANK = new RegExp(`^[${SPACE}]*$`, "u");

/** Removes leading and trailing white space like .NET `string.Trim()`. */
export function trimText(text: string): string {
  return text.replace(SURROUNDING, "");
}

/** Removes trailing white space like .NET `string.TrimEnd()`. */
export function trimTextEnd(text: string): string {
  return text.replace(TRAILING, "");
}

/** True for missing, empty or white-space-only text, like .NET `string.IsNullOrWhiteSpace`. */
export function isBlankText(text: string | null | undefined): boolean {
  return text == null || BLANK.test(text);
}

/** Splits on runs of white space and drops empty parts, like .NET `Split(null, RemoveEmptyEntries)`. */
export function splitOnWhiteSpace(text: string): string[] {
  return text.split(RUN).filter((part) => part.length > 0);
}
