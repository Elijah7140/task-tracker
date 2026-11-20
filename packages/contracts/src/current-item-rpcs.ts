import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { CurrentItemCard } from "./current-item.js";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";

/**
 * The one item the tray card shows (§7.18). The choice is a global setting
 * written outside undo history. A deleted item, or one in a deleted project,
 * reads as no current item until it is restored.
 */
export const CurrentItemRpcs = RpcGroup.make(
  Rpc.make("LoadCurrentItem", {
    success: Schema.NullOr(CurrentItemCard),
    error: RpcOperationError,
  }),
  /** Makes an available item current, or clears the choice with null. */
  Rpc.make("SetCurrentItem", {
    payload: { itemId: Schema.NullOr(Guid) },
    error: RpcOperationError,
  }),
);
