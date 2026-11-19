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

type ItemNode = typeof itemNodeFieldsSchema.Type & { readonly children: ItemSiblings };
/** One level of the item tree, split into open work and finished branches (§6.2). */
export interface ItemSiblings {
  readonly open: readonly ItemNode[];
  readonly finished: readonly ItemNode[];
}
const itemNodeFieldsSchema = Schema.Struct(itemNodeFields);
const itemSiblings = Schema.Struct({
  open: Schema.Array(Schema.suspend((): Schema.Codec<ItemNode> => itemNode)),
  finished: Schema.Array(Schema.suspend((): Schema.Codec<ItemNode> => itemNode)),
});
const itemNode = Schema.Struct({ ...itemNodeFields, children: itemSiblings });

const effectiveValue = <Value extends Schema.Constraint>(value: Value) =>
  Schema.Struct({ value, source: Schema.Literals(["Global", "Project"]) });

/**
 * The active item tree with its lookups and resolved settings. Every level splits
 * siblings into open items in sibling order and finished branches newest-completed
 * first, ties in sibling order (§6.2).
 */
export const AreaSnapshot = Schema.Struct({
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  items: itemSiblings,
  itemTypes: Schema.Array(ItemTypeProjection),
  priorityLevels: Schema.Array(PriorityLevelProjection),
  settings: Schema.Struct({
    autoCompleteParents: effectiveValue(Schema.Boolean),
    urgencyYellowThreshold: effectiveValue(DurationTicks),
    urgencyRedThreshold: effectiveValue(DurationTicks),
  }),
});
