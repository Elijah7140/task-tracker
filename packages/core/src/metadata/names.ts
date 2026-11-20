import { trimText } from "../text/dotnet-white-space.js";
import { MetadataRuleError } from "./metadata-rule-error.js";

/** Validates and trims user-facing names with the legacy length limit. */
export function normalizeName(name: string, label: string, trimBeforeMeasuring = true): string {
  const trimmed = trimText(name);
  const length = trimBeforeMeasuring ? trimmed.length : name.length;
  if (!trimmed || length > 300) {
    throw new MetadataRuleError(`${label} must be 1 to 300 characters.`);
  }
  return trimmed;
}

function ordinalUppercase(character: string): string {
  // Legacy ordinal comparison leaves dotless I and long S distinct from ASCII.
  if (character === "ı" || character === "ſ") {
    return character;
  }

  const upper = character.toUpperCase();
  if (upper.length === character.length) {
    return upper;
  }

  // Greek letters with an iota subscript have single-character uppercase forms
  // even though JavaScript expands them into two characters.
  if (/[ᾀ-ᾇᾐ-ᾗᾠ-ᾧ]/u.test(character)) {
    return String.fromCharCode(character.charCodeAt(0) + 8);
  }
  if (/[ᾳῃῳ]/u.test(character)) {
    return String.fromCharCode(character.charCodeAt(0) + 9);
  }
  return character;
}

/** Builds a locale-independent comparison key without multi-character case expansions. */
export function nameKey(name: string): string {
  return Array.from(name, ordinalUppercase).join("");
}
