/**
 * Trimming that matches the legacy .NET `string.Trim` and `string.IsNullOrWhiteSpace`,
 * for the renderer's inline validation and the link launcher. Core keeps the same
 * helpers for the server's rules (contracts and Core are independent, §4), so keep
 * both character sets identical.
 *
 * .NET white space is U+0009–U+000D, U+0085 and the Unicode space, line and
 * paragraph separators. JavaScript's `trim()` also removes U+FEFF and keeps U+0085.
 */

const SPACE = String.raw`\u0009-\u000d\u0085\p{Z}`;
const SURROUNDING = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "gu");
const BLANK = new RegExp(`^[${SPACE}]*$`, "u");

/** Removes leading and trailing white space like .NET `string.Trim()`. */
export function trimText(text: string): string {
  return text.replace(SURROUNDING, "");
}

/** True for empty or white-space-only text, like .NET `string.IsNullOrWhiteSpace`. */
export function isBlankText(text: string): boolean {
  return BLANK.test(text);
}
