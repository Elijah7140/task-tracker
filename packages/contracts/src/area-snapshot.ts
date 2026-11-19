import { Schema } from "effect";
import { DurationTicks } from "./duration-ticks.js";
import { Guid } from "./guid.js";
import { Item } from "./item.js";
import { ItemTypeProjection, PriorityLevelProjection } from "./lookup-projection.js";

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

const effectiveValue = <Value extends Schema.Constraint>(value: Value) =>
  Schema.Struct({ value, source: Schema.Literals(["Global", "Project"]) });

/** The active item tree, ordered by sibling position, with its lookups and resolved settings. */
export const AreaSnapshot = Schema.Struct({
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  items: Schema.Array(itemNode),
  itemTypes: Schema.Array(ItemTypeProjection),
  priorityLevels: Schema.Array(PriorityLevelProjection),
  settings: Schema.Struct({
    autoCompleteParents: effectiveValue(Schema.Boolean),
    urgencyYellowThreshold: effectiveValue(DurationTicks),
    urgencyRedThreshold: effectiveValue(DurationTicks),
  }),
});
