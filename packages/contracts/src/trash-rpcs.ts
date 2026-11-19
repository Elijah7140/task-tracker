import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import { TrashBatch } from "./trash-batch.js";

/** A null project scope means all projects, including deleted ones. */
const scope = { projectId: Schema.NullOr(Guid) };

/** Trash listing, restore and permanent deletion. Restore records an undo step; purges do not. */
export const TrashRpcs = RpcGroup.make(
  Rpc.make("ListTrash", {
    payload: scope,
    success: Schema.Array(TrashBatch),
    error: RpcOperationError,
  }),
  Rpc.make("RestoreTrashBatch", { payload: { batchId: Guid }, error: RpcOperationError }),
  Rpc.make("PurgeTrashBatch", { payload: { batchId: Guid }, error: RpcOperationError }),
  Rpc.make("EmptyTrash", { payload: scope, error: RpcOperationError }),
);
