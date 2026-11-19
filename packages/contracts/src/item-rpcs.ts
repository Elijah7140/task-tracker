import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AreaSnapshot } from "./area-snapshot.js";
import { CompletionResult } from "./completion-result.js";
import { Guid } from "./guid.js";
import { Item, ItemEdit } from "./item.js";
import { ItemRpcError } from "./item-rpc-error.js";

const area = { projectId: Guid, folderId: Schema.NullOr(Guid) };
const areaItem = { ...area, itemId: Guid };
const parentItemId = Schema.NullOr(Guid);

/** Read and edit the items in a project area. */
export const ItemRpcs = RpcGroup.make(
  Rpc.make("LoadArea", { payload: area, success: AreaSnapshot, error: ItemRpcError }),
  Rpc.make("CreateItem", {
    payload: { ...area, parentItemId, title: Schema.String },
    success: Item,
    error: ItemRpcError,
  }),
  Rpc.make("EditItem", { payload: { itemId: Guid, fields: ItemEdit }, error: ItemRpcError }),
  Rpc.make("SetItemCompleted", {
    payload: {
      ...areaItem,
      completed: Schema.Boolean,
      confirmedOpenItemIds: Schema.optionalKey(Schema.Array(Guid)),
    },
    success: CompletionResult,
    error: ItemRpcError,
  }),
  Rpc.make("IndentItem", { payload: areaItem, error: ItemRpcError }),
  Rpc.make("OutdentItem", { payload: areaItem, error: ItemRpcError }),
  Rpc.make("MoveItem", { payload: { ...areaItem, parentItemId }, error: ItemRpcError }),
  Rpc.make("ReorderItems", {
    payload: { ...area, parentItemId, itemIds: Schema.Array(Guid) },
    error: ItemRpcError,
  }),
  Rpc.make("MoveItemToArea", {
    payload: {
      projectId: Guid,
      sourceFolderId: Schema.NullOr(Guid),
      targetFolderId: Schema.NullOr(Guid),
      itemId: Guid,
    },
    error: ItemRpcError,
  }),
  Rpc.make("DeleteItem", { payload: areaItem, success: Guid, error: ItemRpcError }),
  Rpc.make("RestoreItems", { payload: { ...area, batchId: Guid }, error: ItemRpcError }),
);
