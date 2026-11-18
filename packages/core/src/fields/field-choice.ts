import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { nameKey, normalizeName } from "../metadata/names.js";
import { orderRows } from "../metadata/order-rows.js";
import type { FieldDefinition } from "./field-definition.js";

/** A stable option owned by a choice field. */
export interface FieldChoice {
  readonly id: string;
  readonly fieldDefinitionId: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly isArchived: boolean;
}

function ensureUniqueLabel(choices: readonly FieldChoice[], candidate: FieldChoice): void {
  if (candidate.isArchived) {
    return;
  }
  const key = nameKey(candidate.label);
  const duplicate = choices.some(
    (choice) =>
      choice.id !== candidate.id &&
      choice.fieldDefinitionId === candidate.fieldDefinitionId &&
      !choice.isArchived &&
      nameKey(choice.label) === key,
  );
  if (duplicate) {
    throw new MetadataRuleError("Choice label is already used by this field.");
  }
}

/** Appends a choice after checking the owning field and its active labels. */
export function createChoice(
  id: string,
  field: FieldDefinition,
  label: string,
  choices: readonly FieldChoice[],
): FieldChoice {
  if (field.dataType !== "Choice" || field.isArchived) {
    throw new MetadataRuleError("Choices require an active choice field.");
  }
  const choice = {
    id,
    fieldDefinitionId: field.id,
    label: normalizeName(label, "Choice label"),
    sortOrder: choices.filter((other) => other.fieldDefinitionId === field.id).length,
    isArchived: false,
  };
  ensureUniqueLabel(choices, choice);
  return choice;
}

/** Renames a choice while preserving the ID stored on items. */
export function renameChoice(
  choice: FieldChoice,
  label: string,
  choices: readonly FieldChoice[],
): FieldChoice {
  const renamed = { ...choice, label: normalizeName(label, "Choice label") };
  ensureUniqueLabel(choices, renamed);
  return renamed;
}

/** Hides a choice from pickers while retaining existing item references. */
export function archiveChoice(choice: FieldChoice): FieldChoice {
  return { ...choice, isArchived: true };
}

/** Restores a choice after checking the active labels of its field. */
export function restoreChoice(choice: FieldChoice, choices: readonly FieldChoice[]): FieldChoice {
  const restored = { ...choice, isArchived: false };
  ensureUniqueLabel(choices, restored);
  return restored;
}

/** Returns the reordered choices of the given field, including archived choices. */
export function reorderChoices(
  choices: readonly FieldChoice[],
  fieldDefinitionId: string,
  ids: readonly string[],
): FieldChoice[] {
  return orderRows(
    choices.filter((choice) => choice.fieldDefinitionId === fieldDefinitionId),
    ids,
  );
}
