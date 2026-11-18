import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { FieldChoice } from "./field-choice.js";
import type { FieldDataType } from "./field-data-type.js";
import type { FieldDefinition } from "./field-definition.js";
import type { FieldValueInput } from "./field-value-input.js";

const columnByType = {
  Text: "textValue",
  Number: "numberValue",
  Date: "dateValue",
  Boolean: "boolValue",
  Choice: "choiceId",
} as const satisfies Record<FieldDataType, keyof FieldValueInput>;
const valueColumns = Object.values(columnByType);

/** Counts supplied typed columns, including zero and false values. */
export function countValueColumns(input: FieldValueInput): number {
  return valueColumns.filter((column) => input[column] != null).length;
}

/** Checks project scope for both assigning and clearing a value. */
export function validateFieldScope(projectId: string, field: FieldDefinition): void {
  if (field.projectId !== null && field.projectId !== projectId) {
    throw new MetadataRuleError("Field does not belong to the item's project.");
  }
}

function validateChoice(fieldId: string, choiceId: string, choice: FieldChoice | undefined): void {
  if (
    !choice ||
    choice.id !== choiceId ||
    choice.fieldDefinitionId !== fieldId ||
    choice.isArchived
  ) {
    throw new MetadataRuleError("Choice is missing, archived, or belongs to another field.");
  }
}

/** Validates a typed assignment to an active field with any referenced choice. */
export function validateFieldValue(
  projectId: string,
  field: FieldDefinition,
  input: FieldValueInput,
  choice?: FieldChoice,
): void {
  if (input.fieldDefinitionId !== field.id) {
    throw new MetadataRuleError("Value belongs to another field.");
  }
  validateFieldScope(projectId, field);
  if (field.isArchived) {
    throw new MetadataRuleError("Archived fields cannot receive new values.");
  }
  if (countValueColumns(input) !== 1 || input[columnByType[field.dataType]] == null) {
    throw new MetadataRuleError("Exactly one value matching the field type is required.");
  }
  if (input.numberValue != null && !Number.isFinite(input.numberValue)) {
    throw new MetadataRuleError("Number must be finite.");
  }
  if (input.choiceId != null) {
    validateChoice(field.id, input.choiceId, choice);
  }
}
