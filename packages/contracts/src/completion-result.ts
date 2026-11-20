import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoUtcInstant } from "./iso-date-time.js";

/**
 * Applied changes, a preview to confirm with its descendant IDs, or a blocked operation.
 * An applied result may say that a repeat ended or that a new occurrence of a
 * sub-item kept the item open, so its Done status was not applied (§7.11).
 */
export const CompletionResult = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("applied"),
    changes: Schema.Array(
      Schema.Struct({ itemId: Guid, completedAtUtc: Schema.NullOr(IsoUtcInstant) }),
    ),
    lastRepeat: Schema.optionalKey(Schema.Boolean),
    parentKeptOpenMessage: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("needs-confirmation"),
    openSubItemCount: Schema.Int,
    openSubItemIds: Schema.Array(Guid),
  }),
  Schema.Struct({ kind: Schema.Literal("blocked"), reason: Schema.String }),
]);
