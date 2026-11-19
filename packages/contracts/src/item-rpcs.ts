import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AreaSnapshot } from "./area-snapshot.js";
import { CompletionResult } from "./completion-result.js";
import { FieldValueInput, ItemFieldValue } from "./field-value.js";
import { Guid } from "./guid.js";
import { Item, ItemEdit } from "./item.js";
import { RpcOperationError } from "./rpc-operation-error.js";

const area = { projectId: Guid, folderId: Schema.NullOr(Guid) };
const areaItem = { ...area, itemId: Guid };
const approval = Schema.optionalKey(Schema.Array(Guid));
const parentItemId = Schema.NullOr(Guid);

/** Read and edit the items in a project area. */
export const ItemRpcs = RpcGroup.make(
  Rpc.make("LoadArea", { payload: area, success: AreaSnapshot, error: RpcOperationError }),
  Rpc.make("CreateItem", {
    payload: { ...area, parentItemId, title: Schema.String },
    success: Item,
    error: RpcOperationError,
  }),
  Rpc.make("EditItem", {
    payload: {
      itemId: Guid,
      fields: ItemEdit,
      customValues: Schema.optionalKey(Schema.Array(FieldValueInput)),
      confirmedOpenItemIds: approval,
    },
    success: CompletionResult,
    error: RpcOperationError,
  }),
  Rpc.make("SetItemStatus", {
    payload: { itemId: Guid, statusId: Schema.NullOr(Guid), confirmedOpenItemIds: approval },
    success: CompletionResult,
    error: RpcOperationError,
  }),
  Rpc.make("SetItemCompleted", {
    payload: {
      ...areaItem,
      completed: Schema.Boolean,
      confirmedOpenItemIds: approval,
    },
    success: CompletionResult,
    error: RpcOperationError,
  }),
  Rpc.make("IndentItem", { payload: areaItem, error: RpcOperationError }),
  Rpc.make("OutdentItem", { payload: areaItem, error: RpcOperationError }),
  Rpc.make("MoveItem", { payload: { ...areaItem, parentItemId }, error: RpcOperationError }),
  Rpc.make("ReorderItems", {
    payload: { ...area, parentItemId, itemIds: Schema.Array(Guid) },
    error: RpcOperationError,
  }),
  Rpc.make("MoveItemToArea", {
    payload: {
      projectId: Guid,
      sourceFolderId: Schema.NullOr(Guid),
      targetFolderId: Schema.NullOr(Guid),
      itemId: Guid,
    },
    error: RpcOperationError,
  }),
  Rpc.make("DeleteItem", { payload: areaItem, success: Guid, error: RpcOperationError }),
  Rpc.make("RestoreItems", { payload: { ...area, batchId: Guid }, error: RpcOperationError }),
  Rpc.make("LoadItemFieldValues", {
    payload: { itemId: Guid },
    success: Schema.Array(ItemFieldValue),
    error: RpcOperationError,
  }),
);
