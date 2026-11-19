import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { RpcOperationError } from "./rpc-operation-error.js";

/** Labels of the actions available to replay and the session's current history revision. */
export const HistoryStatus = Schema.Struct({
  undo: Schema.NullOr(Schema.String),
  redo: Schema.NullOr(Schema.String),
  revision: Schema.Number,
});

const applied = Schema.Struct({ label: Schema.String, revision: Schema.Number });

/** Session history queries and replay. A null result means there was no action to apply. */
export const HistoryRpcs = RpcGroup.make(
  Rpc.make("GetHistory", { success: HistoryStatus, error: RpcOperationError }),
  Rpc.make("ApplyHistory", {
    payload: { direction: Schema.Literals(["undo", "redo"]) },
    success: Schema.NullOr(applied),
    error: RpcOperationError,
  }),
);
