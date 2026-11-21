import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { InProgressItem } from "./in-progress-item.js";
import { RpcOperationError } from "./rpc-operation-error.js";

/**
 * The tray card's stack (§7.18): every open, available item whose status is
 * marked In progress, most urgent first, then by priority, deadline and title.
 */
export const InProgressRpcs = RpcGroup.make(
  Rpc.make("LoadInProgressItems", {
    success: Schema.Array(InProgressItem),
    error: RpcOperationError,
  }),
);
