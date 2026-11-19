import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { ItemTypeProjection, PriorityLevelProjection } from "./lookup-projection.js";
import { RpcOperationError } from "./rpc-operation-error.js";

const lookupRpcs = <
  Name extends string,
  Row extends Schema.Top,
  Extra extends Schema.Struct.Fields,
>(
  singular: Name,
  plural: `${Name}s`,
  row: Row,
  extra: Extra,
) =>
  [
    Rpc.make(`List${plural}`, { success: Schema.Array(row), error: RpcOperationError }),
    Rpc.make(`Add${singular}`, {
      payload: { name: Schema.String, ...extra },
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

/** Manage item types and priority levels. Lists include archived rows in their order. */
export const LookupRpcs = RpcGroup.make(
  ...lookupRpcs("ItemType", "ItemTypes", ItemTypeProjection, {}),
  ...lookupRpcs("PriorityLevel", "PriorityLevels", PriorityLevelProjection, {
    number: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  }),
  Rpc.make("SetPriorityNumber", {
    payload: { id: Guid, number: Schema.NullOr(Schema.Number) },
    error: RpcOperationError,
  }),
);
