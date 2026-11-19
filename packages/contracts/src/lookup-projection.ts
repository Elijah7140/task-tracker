import { Schema } from "effect";
import { Guid } from "./guid.js";

/** Fields shared by item types and priority levels, including archived rows. */
const lookupFields = {
  id: Guid,
  name: Schema.String,
  colorKey: Schema.NullOr(Schema.String),
  isBuiltIn: Schema.Boolean,
  isArchived: Schema.Boolean,
  sortOrder: Schema.Int,
};

/** An item type. Archived types stay listed so existing items keep their reference. */
export const ItemTypeProjection = Schema.Struct({
  ...lookupFields,
  iconKey: Schema.NullOr(Schema.String),
});

/** A priority level ranked by its position. Archived levels stay listed for existing items. */
export const PriorityLevelProjection = Schema.Struct(lookupFields);
