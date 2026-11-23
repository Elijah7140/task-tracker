import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AreaSnapshot } from "./area-snapshot.js";
import { CompletionResult } from "./completion-result.js";
import { FieldValueInput, ItemFieldValue } from "./field-value.js";
import { Guid } from "./guid.js";
import { Item, ItemEdit } from "./item.js";
import { ItemLink, ItemLinkInput } from "./item-link.js";
import { RecurrenceRule } from "./recurrence-rule.js";
import { ReminderChoice } from "./reminder.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import { AddTicketsError, NewTicketInput } from "./ticket-batch.js";
import {
  ItemKind,
  TicketCommentProjection,
  TicketDetailInput,
  TicketSnapshot,
} from "./ticket-fields.js";

const area = { projectId: Guid, folderId: Schema.NullOr(Guid) };
const areaItem = { ...area, itemId: Guid };
const approval = Schema.optionalKey(Schema.Array(Guid));
const parentItemId = Schema.NullOr(Guid);

/** Read and edit the items in a project area. */
export const ItemRpcs = RpcGroup.make(
  Rpc.make("LoadArea", { payload: area, success: AreaSnapshot, error: RpcOperationError }),
  Rpc.make("CreateItem", {
    payload: {
      ...area,
      parentItemId,
      title: Schema.String,
      /** Places the new item right after this open sibling; omitted appends it (§7.17). */
      afterItemId: Schema.optionalKey(Guid),
    },
    success: Item,
    error: RpcOperationError,
  }),
  /** Adds a ToDo or Ticket from quick add or the detailed add view as one step (§7.19). */
  Rpc.make("AddItem", {
    payload: {
      ...area,
      parentItemId,
      kind: ItemKind,
      fields: ItemEdit,
      customValues: Schema.optionalKey(Schema.Array(FieldValueInput)),
      reminder: Schema.optionalKey(ReminderChoice),
      /** The ticket fields; omitted for a ToDo, or for a ticket with none filled in. */
      ticket: Schema.optionalKey(TicketDetailInput),
    },
    success: Item,
    error: RpcOperationError,
  }),
  /**
   * Adds every ticket from the tray's multi-ticket add view to the top of one area, in
   * order, as one transaction and one undo step (§7.20).
   */
  Rpc.make("AddTickets", {
    payload: {
      ...area,
      tickets: Schema.Array(NewTicketInput).check(Schema.isMinLength(1)),
    },
    success: Schema.Array(Item),
    error: AddTicketsError,
  }),
  /** A ticket's fixed fields and comment log (§7.19). */
  Rpc.make("LoadTicket", {
    payload: { itemId: Guid },
    success: TicketSnapshot,
    error: RpcOperationError,
  }),
  Rpc.make("AddTicketComment", {
    payload: { itemId: Guid, body: Schema.String },
    success: TicketCommentProjection,
    error: RpcOperationError,
  }),
  Rpc.make("EditItem", {
    payload: {
      itemId: Guid,
      fields: ItemEdit,
      customValues: Schema.optionalKey(Schema.Array(FieldValueInput)),
      /** Replaces the item's whole link list when present; omitted keeps the stored links. */
      links: Schema.optionalKey(Schema.Array(ItemLinkInput)),
      /** Replaces the repeat rule when present; null stops repeating, omitted keeps it (§7.11). */
      recurrence: Schema.optionalKey(Schema.NullOr(RecurrenceRule)),
      /** Replaces the reminder choice when present; omitted keeps it (§7.12). */
      reminder: Schema.optionalKey(ReminderChoice),
      /** Replaces a ticket's fixed fields when present; omitted keeps them (§7.19). */
      ticket: Schema.optionalKey(TicketDetailInput),
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
  Rpc.make("SetItemPriority", {
    payload: { itemId: Guid, priorityLevelId: Schema.NullOr(Guid) },
    error: RpcOperationError,
  }),
  /** Moves an open item's due date and scheduled block one calendar day later (§7.14). */
  Rpc.make("PushBackOneDay", { payload: { itemId: Guid }, error: RpcOperationError }),
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
  Rpc.make("DropItem", {
    payload: {
      ...areaItem,
      targetItemId: Guid,
      position: Schema.Literals(["before", "after", "into"]),
    },
    error: RpcOperationError,
  }),
  Rpc.make("MoveItemToPriorityGroup", {
    payload: {
      ...areaItem,
      priorityLevelId: Schema.NullOr(Guid),
      index: Schema.Int,
      /** The level the card moves within: the drilled-in item, or absent for the top level. */
      levelParentId: Schema.optionalKey(Schema.NullOr(Guid)),
    },
    error: RpcOperationError,
  }),
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
  /** Moves an open occurrence to its next date. False means the rule has no next date (§7.11). */
  Rpc.make("SkipRepeat", {
    payload: { itemId: Guid },
    success: Schema.Boolean,
    error: RpcOperationError,
  }),
  /** Removes the repeat rule from this occurrence only (§7.11). */
  Rpc.make("StopRepeating", { payload: { itemId: Guid }, error: RpcOperationError }),
  Rpc.make("LoadItemLinks", {
    payload: { itemId: Guid },
    success: Schema.Array(ItemLink),
    error: RpcOperationError,
  }),
);
