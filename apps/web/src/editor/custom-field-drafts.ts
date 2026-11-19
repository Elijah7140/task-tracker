import type {
  FieldChoiceProjection,
  FieldDefinitionProjection,
  FieldValueInput,
  ItemFieldValue,
} from "@task-tracker/contracts";
import { formatFloatingDate } from "../format/item-dates.js";
import { formatNumber, parseNumber } from "./number-text.js";

type Definition = typeof FieldDefinitionProjection.Type;
type Choice = typeof FieldChoiceProjection.Type;
type Stored = typeof ItemFieldValue.Type;
type Input = typeof FieldValueInput.Type;

/** A Boolean field's pick, where "none" means no stored value. */
export type BooleanSelection = "none" | "yes" | "no";

/** One custom field's value as the editor holds it, by data type. */
export type CustomFieldDraft =
  | { readonly kind: "Text"; readonly text: string }
  | { readonly kind: "Number"; readonly text: string }
  | { readonly kind: "Date"; readonly date: string }
  | { readonly kind: "Boolean"; readonly selection: BooleanSelection }
  | { readonly kind: "Choice"; readonly choiceId: string | null };

/** The inline message for a number that cannot be saved. */
export const NUMBER_ERROR = "Enter a valid number.";

/** Shown for a missing value in read-only displays. */
const NO_VALUE = "(none)";

const BOOLEAN_LABELS: Record<BooleanSelection, string> = { none: NO_VALUE, yes: "Yes", no: "No" };

function selectionFor(value: boolean | null): BooleanSelection {
  if (value === null) {
    return "none";
  }
  return value ? "yes" : "no";
}

/** The draft that shows a stored value, or no value, in the field's input. */
export function storedDraft(
  field: Definition,
  stored: Stored | undefined,
  locale?: string,
): CustomFieldDraft {
  switch (field.dataType) {
    case "Text":
      return { kind: "Text", text: stored?.textValue ?? "" };
    case "Number":
      return { kind: "Number", text: formatNumber(stored?.numberValue ?? null, locale) };
    case "Date":
      return { kind: "Date", date: stored?.dateValue ?? "" };
    case "Boolean":
      return { kind: "Boolean", selection: selectionFor(stored?.boolValue ?? null) };
    case "Choice":
      return { kind: "Choice", choiceId: stored?.choiceId ?? null };
  }
}

/** The inline validation message, or null when the draft can be saved. */
export function draftError(draft: CustomFieldDraft, locale?: string): string | null {
  return draft.kind === "Number" && parseNumber(draft.text, locale).kind === "invalid"
    ? NUMBER_ERROR
    : null;
}

function parsedNumber(text: string, locale: string | undefined): number | null {
  const parsed = parseNumber(text, locale);
  return parsed.kind === "number" ? parsed.value : null;
}

function booleanValue(selection: BooleanSelection): boolean | null {
  return selection === "none" ? null : selection === "yes";
}

/**
 * The replacement value the editor sends for a field. Null means "remove the
 * value"; the server applies the remaining rules (§7.1).
 */
export function draftInput(field: Definition, draft: CustomFieldDraft, locale?: string): Input {
  const fieldDefinitionId = field.id;
  switch (draft.kind) {
    case "Text":
      return { fieldDefinitionId, textValue: draft.text.trim() || null };
    case "Number":
      return { fieldDefinitionId, numberValue: parsedNumber(draft.text, locale) };
    case "Date":
      return { fieldDefinitionId, dateValue: draft.date || null };
    case "Boolean":
      return { fieldDefinitionId, boolValue: booleanValue(draft.selection) };
    case "Choice":
      return { fieldDefinitionId, choiceId: draft.choiceId };
  }
}

/** The typed value column each data type uses. */
const VALUE_COLUMN = {
  Text: "textValue",
  Number: "numberValue",
  Date: "dateValue",
  Boolean: "boolValue",
  Choice: "choiceId",
} as const satisfies Record<Definition["dataType"], keyof Input & keyof Stored>;

function typedValue(field: Definition, input: Input) {
  return input[VALUE_COLUMN[field.dataType]] ?? null;
}

/**
 * True when the draft would change the stored value, or cannot be parsed, so
 * an invalid entry is never silently forgotten.
 */
export function isDraftChanged(
  field: Definition,
  draft: CustomFieldDraft,
  stored: Stored | undefined,
  locale?: string,
): boolean {
  if (draftError(draft, locale) !== null) {
    return true;
  }
  const typed = typedValue(field, draftInput(field, draft, locale));
  const original = stored === undefined ? null : stored[VALUE_COLUMN[field.dataType]];
  return typed !== original;
}

function choiceLabel(choices: ReadonlyArray<Choice>, choiceId: string | null): string {
  const choice = choices.find((candidate) => candidate.id === choiceId);
  if (choice === undefined) {
    return NO_VALUE;
  }
  return choice.isArchived ? `${choice.label} (archived)` : choice.label;
}

// A calendar date is floating (§5.4), so it is shown like an item's due date.
const dateLabel = (date: string | null) => (date === null ? NO_VALUE : formatFloatingDate(date));

/** A stored value as read-only text, used for archived fields. */
export function storedDisplayValue(
  field: Definition,
  stored: Stored | undefined,
  choices: ReadonlyArray<Choice>,
  locale?: string,
): string {
  switch (field.dataType) {
    case "Text":
      return stored?.textValue ?? NO_VALUE;
    case "Number":
      return formatNumber(stored?.numberValue ?? null, locale) || NO_VALUE;
    case "Date":
      return dateLabel(stored?.dateValue ?? null);
    case "Boolean":
      return BOOLEAN_LABELS[selectionFor(stored?.boolValue ?? null)];
    case "Choice":
      return choiceLabel(choices, stored?.choiceId ?? null);
  }
}

/**
 * What a field's input shows: the typed draft, or the stored value when
 * nothing was typed or the field's type changed since.
 */
export function currentDraft(
  field: Definition,
  stored: Stored | undefined,
  typed: CustomFieldDraft | undefined,
  locale?: string,
): CustomFieldDraft {
  return typed?.kind === field.dataType ? typed : storedDraft(field, stored, locale);
}
