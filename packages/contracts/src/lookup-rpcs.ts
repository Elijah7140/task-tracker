import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { ItemTypeProjection, PriorityLevelProjection } from "./lookup-projection.js";
import { RpcOperationError } from "./rpc-operation-error.js";

import { StatusKind, StatusProjection } from "./status-projection.js";

const lookupRpcs = <Name extends string, Row extends Schema.Top>(
  singular: Name,
  plural: `${Name}s`,
  row: Row,
) =>
  [
    Rpc.make(`List${plural}`, { success: Schema.Array(row), error: RpcOperationError }),
    Rpc.make(`Add${singular}`, {
      payload: { name: Schema.String },
      success: row,
      error: RpcOperationError,
    }),
    Rpc.make(`Rename${singular}`, {
      payload: { id: Guid, name: Schema.String },
      error: RpcOperationError,
    }),
    Rpc.make(`Archive${singular}`, { payload: { id: Guid }, error: RpcOperationError }),
    Rpc.make(`Restore${singular}`, { payload: { id: Guid }, error: RpcOperationError }),
    Rpc.make(`Reorder${plural}`, {
      payload: { ids: Schema.Array(Guid) },
      error: RpcOperationError,
    }),
  ] as const;

/** Manage item types, priority levels and workflow statuses. Lists include archived rows in their order. */
export const LookupRpcs = RpcGroup.make(
  Rpc.make("ListStatuses", { success: Schema.Array(StatusProjection), error: RpcOperationError }),
  Rpc.make("AddStatus", {
    payload: { name: Schema.String, kind: StatusKind },
    success: StatusProjection,
    error: RpcOperationError,
  }),
  Rpc.make("RenameStatus", {
    payload: { id: Guid, name: Schema.String },
    error: RpcOperationError,
  }),
  Rpc.make("ArchiveStatus", { payload: { id: Guid }, error: RpcOperationError }),
  Rpc.make("RestoreStatus", { payload: { id: Guid }, error: RpcOperationError }),
  Rpc.make("ReorderStatuses", {
    payload: { ids: Schema.Array(Guid) },
    error: RpcOperationError,
  }),
  ...lookupRpcs("ItemType", "ItemTypes", ItemTypeProjection),
  ...lookupRpcs("PriorityLevel", "PriorityLevels", PriorityLevelProjection),
);
