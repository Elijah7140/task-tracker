// Match .NET char.IsWhiteSpace, including NEL and excluding the byte-order mark.
const SPACE = String.raw`\u0009-\u000d\u0085\p{Z}`;
const WHITESPACE = new RegExp(`^[${SPACE}]$`, "u");
const BLANK = new RegExp(`^[${SPACE}]*$`, "u");
const SURROUNDING_SPACE = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "gu");
// Match .NET char.IsLetterOrDigit for one UTF-16 code unit, so lone surrogates never match.
const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u;

/** True when the UTF-16 code unit is whitespace under the legacy scanner's rule. */
export function isQueryWhitespace(character: string): boolean {
  return WHITESPACE.test(character);
}

/** True when the UTF-16 code unit may appear in a clause key. */
export function isKeyCharacter(character: string): boolean {
  return LETTER_OR_DIGIT.test(character) || character === "_" || character === "-";
}

/** True when the text is empty or only whitespace. */
export function isBlankQueryText(text: string): boolean {
  return BLANK.test(text);
}

/** Removes leading and trailing whitespace by the legacy rule, keeping a byte-order mark. */
export function trimQueryText(text: string): string {
  return text.replace(SURROUNDING_SPACE, "");
}

/** Splits text into its whitespace-separated words. */
export function queryWords(text: string): ReadonlyArray<string> {
  return text.split(new RegExp(`[${SPACE}]+`, "u")).filter((word) => word.length > 0);
}

/** Lower-cases each code point with its single-character mapping, like `ToLowerInvariant`. */
export function toLowerInvariant(text: string): string {
  return Array.from(text, (character) => {
    const lower = character.toLowerCase();
    return Array.from(lower).length === 1 ? lower : character;
  }).join("");
}
