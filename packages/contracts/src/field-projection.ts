import { Schema } from "effect";
import { Guid } from "./guid.js";

/** Supported custom-field storage types carried over from the legacy schema. */
export const FieldDataType = Schema.Literals(["Text", "Number", "Date", "Boolean", "Choice"]);

/** A custom field definition with its immutable slug key, scope, order and archive state. */
export const FieldDefinitionProjection = Schema.Struct({
  id: Guid,
  key: Schema.String,
  displayName: Schema.String,
  dataType: FieldDataType,
  projectId: Schema.NullOr(Guid),
  isArchived: Schema.Boolean,
  sortOrder: Schema.Int,
});

/** A selectable option owned by a choice custom field, including archived choices. */
export const FieldChoiceProjection = Schema.Struct({
  id: Guid,
  fieldDefinitionId: Guid,
  label: Schema.String,
  sortOrder: Schema.Int,
  isArchived: Schema.Boolean,
});
