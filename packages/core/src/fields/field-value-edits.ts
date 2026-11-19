import { EntityMissing } from "../entity-missing.js";
import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { trimMetadataText } from "../metadata/names.js";
import type { FieldChoice } from "./field-choice.js";
import type { FieldDefinition } from "./field-definition.js";
import type { FieldValueInput } from "./field-value-input.js";
import {
  countValueColumns,
  validateFieldScope,
  validateFieldValue,
} from "./field-value-validator.js";
import type { ItemFieldValue } from "./item-field-value.js";

/** The rows to upsert and field IDs to remove for a single item's partial edit. */
export interface FieldValueEdits {
  readonly upserts: readonly ItemFieldValue[];
  readonly removals: readonly string[];
}

function normalizeValue(itemId: string, input: FieldValueInput): ItemFieldValue {
  return {
    itemId,
    fieldDefinitionId: input.fieldDefinitionId,
    textValue: trimMetadataText(input.textValue ?? "") || null,
    numberValue: input.numberValue ?? null,
    dateValue: input.dateValue ?? null,
    boolValue: input.boolValue ?? null,
    choiceId: input.choiceId ?? null,
  };
}

function sameValue(old: ItemFieldValue, next: ItemFieldValue): boolean {
  return (
    old.textValue === next.textValue &&
    old.numberValue === next.numberValue &&
    (old.dateValue === next.dateValue ||
      (old.dateValue !== null &&
        next.dateValue !== null &&
        old.dateValue.equals(next.dateValue))) &&
    old.boolValue === next.boolValue &&
    old.choiceId === next.choiceId
  );
}

/** Plans all supplied custom edits from one snapshot without modifying any input rows. */
export function planFieldValueEdits(
  itemId: string,
  projectId: string,
  fields: readonly FieldDefinition[],
  choices: readonly FieldChoice[],
  existing: readonly ItemFieldValue[],
  inputs: readonly FieldValueInput[],
): FieldValueEdits {
  if (new Set(inputs.map((input) => input.fieldDefinitionId)).size !== inputs.length) {
    throw new MetadataRuleError("Each field may appear only once.");
  }

  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const choicesById = new Map(choices.map((choice) => [choice.id, choice]));
  const existingByField = new Map(
    existing
      .filter((value) => value.itemId === itemId)
      .map((value) => [value.fieldDefinitionId, value]),
  );
  const upserts: ItemFieldValue[] = [];
  const removals: string[] = [];

  for (const input of inputs) {
    const field = fieldsById.get(input.fieldDefinitionId);
    if (!field) {
      throw new EntityMissing("Field", "Field was not found.");
    }

    validateFieldScope(projectId, field);
    const next = normalizeValue(itemId, input);
    const old = existingByField.get(field.id);
    if (countValueColumns(next) === 0) {
      if (old) {
        removals.push(field.id);
      }
      continue;
    }

    // Unchanged archived fields and choices can be echoed by the editor.
    if (old && sameValue(old, next)) {
      continue;
    }

    const choice = next.choiceId === null ? undefined : choicesById.get(next.choiceId);
    validateFieldValue(projectId, field, next, choice);
    upserts.push(next);
  }

  return { upserts, removals };
}
