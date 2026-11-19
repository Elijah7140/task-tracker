import type { FilterValue } from "../filter-value.js";
import type { SearchableField, SearchChoice } from "../searchable-field.js";
import { foldSearchText } from "../text-folding.js";
import { isBlankQueryText, trimQueryText } from "./query-characters.js";
import { readQueryDate } from "./query-dates.js";
import {
  formatChoiceValue,
  isChoiceIdText,
  priorityNumberOf,
  quoteIfNeeded,
} from "./query-quoting.js";
import type { QueryEndpoint } from "./query-scanner.js";

/** A value read from query text with its stable and display spellings, or why it failed. */
export type ValueOutcome =
  | {
      readonly ok: true;
      readonly value: FilterValue;
      /** How the value is written in stable text, with choices as `#id`. */
      readonly stable: string;
      /** How users read it: choices by label and everything else as typed. */
      readonly display: string;
    }
  | { readonly ok: false; readonly error: string };

/** Choice lists by field key. A field missing from the map has no choices. */
export type ChoicesByFieldKey = ReadonlyMap<string, ReadonlyArray<SearchChoice>>;

// Invariant-culture NumberStyles.Float: sign, decimal point and exponent, ASCII digits only.
const INVARIANT_NUMBER = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

const ok = (value: FilterValue, stable: string, display = stable): ValueOutcome => ({
  ok: true,
  value,
  stable,
  display,
});

const fail = (error: string): ValueOutcome => ({ ok: false, error });

const sameText = (left: string, right: string) => foldSearchText(left) === foldSearchText(right);

function readNumber(value: string): ValueOutcome {
  const number = INVARIANT_NUMBER.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) {
    return fail(`'${value}' is not a number. Write decimals with a dot, like 2.5.`);
  }
  return ok({ kind: "number", value: number }, value);
}

function readBoolean(value: string): ValueOutcome {
  const folded = foldSearchText(value);
  const isYes = folded === "yes" || folded === "true";
  const isNo = folded === "no" || folded === "false";
  if (!isYes && !isNo) {
    return fail(`'${value}' is not yes or no.`);
  }
  return ok({ kind: "boolean", value: isYes }, isYes ? "yes" : "no");
}

function findChoice(options: ReadonlyArray<SearchChoice>, value: string, quoted: boolean) {
  if (!quoted && isChoiceIdText(value)) {
    const id = value.slice(1).toUpperCase();
    return options.find((option) => option.id === id);
  }
  const number = quoted ? null : priorityNumberOf(value);
  return (
    (number === null ? undefined : options.find((option) => option.number === number)) ??
    options.find((option) => sameText(option.name ?? option.label, value)) ??
    options.find((option) => sameText(option.label, value))
  );
}

function unknownChoiceMessage(
  field: SearchableField,
  value: string,
  options: ReadonlyArray<SearchChoice>,
) {
  if (value.startsWith("#")) {
    return `That ${field.displayName} choice no longer exists.`;
  }
  const labels = options.map((option) => option.label).join(", ");
  return `'${value}' is not a ${field.displayName} choice. Choose one of: ${labels}.`;
}

/**
 * Turns the text after an operator into a typed {@link FilterValue}. Numbers always use
 * the invariant culture so a saved search means the same on every machine, relative
 * dates resolve from `today`, and choices resolve by ID, priority number or label (§7.7).
 */
export function queryValueReader(today: Temporal.PlainDate, choicesByFieldKey: ChoicesByFieldKey) {
  /** The choices a choice field offers, or none for other fields. */
  const optionsFor = (field: SearchableField) => choicesByFieldKey.get(field.key) ?? [];

  const readDate = (value: string): ValueOutcome => {
    const date = readQueryDate(value, today);
    if (date === null) {
      return fail(
        `'${value}' is not a date. Use yyyy-MM-dd, today, tomorrow, yesterday, or an offset like +3d or -1w.`,
      );
    }
    return ok({ kind: "date", value: date.toString() }, value);
  };

  const readChoice = (field: SearchableField, value: string, quoted: boolean): ValueOutcome => {
    const options = optionsFor(field);
    const match = findChoice(options, value, quoted);
    if (match === undefined) {
      return fail(unknownChoiceMessage(field, value, options));
    }
    const display = formatChoiceValue(match, field.key);
    return ok({ kind: "choice", id: match.id }, `#${match.id}`, display);
  };

  /** Reads one value for the field's data type. */
  const read = (field: SearchableField, endpoint: QueryEndpoint): ValueOutcome => {
    if (isBlankQueryText(endpoint.value)) {
      return fail("A value is needed here.");
    }
    const trimmed = trimQueryText(endpoint.value);
    switch (field.dataType) {
      case "Text":
        return ok({ kind: "text", value: endpoint.value }, quoteIfNeeded(endpoint.value));
      case "Number":
        return readNumber(trimmed);
      case "Date":
        return readDate(trimmed);
      case "Boolean":
        return readBoolean(trimmed);
      case "Choice":
        return readChoice(field, trimmed, endpoint.quoted);
    }
  };

  /** A priority-style range between two choices, or null when they run the wrong way. */
  const combineChoices = (field: SearchableField, lowId: string, highId: string) => {
    const rank = (id: string) => optionsFor(field).find((option) => option.id === id)!.sortOrder;
    return rank(lowId) > rank(highId)
      ? null
      : ({ kind: "choiceRange", min: lowId, max: highId } satisfies FilterValue);
  };

  return { optionsFor, read, readRange: rangeReader(read, combineChoices) };
}

type Read = (field: SearchableField, endpoint: QueryEndpoint) => ValueOutcome;
type CombineChoices = (field: SearchableField, lowId: string, highId: string) => FilterValue | null;

/** A number or date range, or null when the ends run backwards or differ in kind. */
function combineOrdered(low: FilterValue, high: FilterValue): FilterValue | null {
  if (low.kind === "number" && high.kind === "number") {
    return low.value <= high.value
      ? { kind: "numberRange", min: low.value, max: high.value }
      : null;
  }
  if (low.kind === "date" && high.kind === "date") {
    return low.value <= high.value ? { kind: "dateRange", min: low.value, max: high.value } : null;
  }
  return null;
}

/** Reads both ends of an `a..b` range and checks that they run low to high. */
function rangeReader(read: Read, combineChoices: CombineChoices) {
  return (field: SearchableField, first: QueryEndpoint, second: QueryEndpoint): ValueOutcome => {
    const low = read(field, first);
    if (!low.ok) {
      return low;
    }
    const high = read(field, second);
    if (!high.ok) {
      return high;
    }
    const stable = `${low.stable}..${high.stable}`;
    const display = `${low.display}..${high.display}`;
    if (low.value.kind === "choice" && high.value.kind === "choice") {
      const range = combineChoices(field, low.value.id, high.value.id);
      return range === null
        ? fail("Put the more important choice first, like priority:high..low.")
        : ok(range, stable, display);
    }
    const range = combineOrdered(low.value, high.value);
    return range !== null
      ? ok(range, stable, display)
      : fail("The first value must not be after the second.");
  };
}
