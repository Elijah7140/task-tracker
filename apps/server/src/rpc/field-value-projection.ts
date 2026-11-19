import type { FieldValueInput, ItemFieldValue } from "@task-tracker/contracts";
import type {
  FieldValueInput as DomainFieldValueInput,
  ItemFieldValue as DomainItemFieldValue,
} from "@task-tracker/core";

/** Parse wire custom-field edits into domain values without losing zero or false entries. */
export function parseFieldValueInput(input: typeof FieldValueInput.Type): DomainFieldValueInput {
  return {
    fieldDefinitionId: input.fieldDefinitionId,
    textValue: input.textValue ?? null,
    numberValue: input.numberValue ?? null,
    dateValue: input.dateValue == null ? null : Temporal.PlainDate.from(input.dateValue),
    boolValue: input.boolValue ?? null,
    choiceId: input.choiceId ?? null,
  };
}

/** Convert persisted custom-field values to JSON-safe wire values with ISO calendar dates. */
export function projectItemFieldValue(value: DomainItemFieldValue): typeof ItemFieldValue.Type {
  return {
    ...value,
    dateValue: value.dateValue?.toString() ?? null,
  };
}
