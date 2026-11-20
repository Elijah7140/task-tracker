import type { SearchChoice } from "../searchable-field.js";
import { isQueryWhitespace } from "./query-characters.js";

const SPECIAL_CHARACTERS = new Set(['"', "\\", ":", "~", "<", ">", "!"]);
const CHOICE_ID = /^#[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE_NUMBER = /^[0-9]+$/;
const MAX_PRIORITY_NUMBER = 2_147_483_647;

/** True when unquoted text is written as a choice ID, `#` followed by a GUID. */
export function isChoiceIdText(value: string): boolean {
  return CHOICE_ID.test(value);
}

/** The whole number of at least 1 that `value` spells, the form of a priority number (§7.15). */
export function priorityNumberOf(value: string): number | null {
  if (!WHOLE_NUMBER.test(value)) {
    return null;
  }
  const number = Number(value);
  return number >= 1 && number <= MAX_PRIORITY_NUMBER ? number : null;
}

/** Wraps the value in quotes, escaping embedded quotes and backslashes. */
export function quoteQueryValue(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

function needsQuotes(value: string): boolean {
  if (value.length === 0 || value.includes("..")) {
    return true;
  }
  return Array.from(value).some(
    (character) => isQueryWhitespace(character) || SPECIAL_CHARACTERS.has(character),
  );
}

/** Returns the value as written, quoted only when the scanner would otherwise misread it. */
export function quoteIfNeeded(value: string): string {
  return needsQuotes(value) ? quoteQueryValue(value) : value;
}

/** Quotes a choice label that would otherwise read as a choice ID. */
function quoteChoiceLabel(label: string): string {
  return isChoiceIdText(label) ? quoteQueryValue(label) : quoteIfNeeded(label);
}

/**
 * Writes a choice value. A numbered priority is written as its number, and a priority
 * named like a number is quoted so it is not read back as a number (§7.15).
 */
export function formatChoiceValue(choice: SearchChoice, fieldKey: string): string {
  if (fieldKey !== "priority") {
    return quoteChoiceLabel(choice.label);
  }
  if (choice.number !== null) {
    return String(choice.number);
  }
  return priorityNumberOf(choice.label) === null
    ? quoteChoiceLabel(choice.label)
    : quoteQueryValue(choice.label);
}
