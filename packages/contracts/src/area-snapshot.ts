import { Schema } from "effect";
import { Guid } from "./guid.js";
import { Item } from "./item.js";

const urgency = Schema.Literals(["None", "Approaching", "Imminent", "Overdue"]);
const itemNodeFields = {
  item: Item,
  ownUrgency: urgency,
  displayedUrgency: Schema.Struct({
    value: urgency,
    sourceDescendantId: Schema.NullOr(Guid),
  }),
  isFinished: Schema.Boolean,
};

type ItemNode = typeof itemNodeFieldsSchema.Type & { readonly children: readonly ItemNode[] };
const itemNodeFieldsSchema = Schema.Struct(itemNodeFields);
const itemNode = Schema.Struct({
  ...itemNodeFields,
  children: Schema.Array(Schema.suspend((): Schema.Codec<ItemNode> => itemNode)),
});

const lookupFields = {
  id: Guid,
  name: Schema.String,
  colorKey: Schema.NullOr(Schema.String),
  isBuiltIn: Schema.Boolean,
  isArchived: Schema.Boolean,
  sortOrder: Schema.Int,
};

const effectiveValue = <Value extends Schema.Constraint>(value: Value) =>
  Schema.Struct({ value, source: Schema.Literals(["Global", "Project"]) });

// Decimal strings retain the exact TimeSpan tick count in JSON.
const durationTicks = Schema.String.check(Schema.isPattern(/^\d+$/));

/** The active item tree, ordered by sibling position, with its lookups and resolved settings. */
export const AreaSnapshot = Schema.Struct({
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  items: Schema.Array(itemNode),
  itemTypes: Schema.Array(
    Schema.Struct({ ...lookupFields, iconKey: Schema.NullOr(Schema.String) }),
  ),
  priorityLevels: Schema.Array(Schema.Struct(lookupFields)),
  settings: Schema.Struct({
    autoCompleteParents: effectiveValue(Schema.Boolean),
    urgencyYellowThreshold: effectiveValue(durationTicks),
    urgencyRedThreshold: effectiveValue(durationTicks),
  }),
});
