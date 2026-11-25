import { Schema } from "effect";
import { Guid } from "./guid.js";

/** A lookup row's shared fields, including archived rows. */
const lookupFields = {
  id: Guid,
  name: Schema.String,
  colorKey: Schema.NullOr(Schema.String),
  isBuiltIn: Schema.Boolean,
  isArchived: Schema.Boolean,
  sortOrder: Schema.Int,
};

/** A priority level ranked by its position. Archived levels stay listed for existing items. */
export const PriorityLevelProjection = Schema.Struct({
  ...lookupFields,
  number: Schema.NullOr(Schema.Int),
  label: Schema.String,
});
