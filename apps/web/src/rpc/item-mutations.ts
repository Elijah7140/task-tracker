import { TaskTrackerClient } from "./task-tracker-client.js";

/** Creates a top-level item or sub-item in an area. */
export const createItemAtom = TaskTrackerClient.mutation("CreateItem");

/** Updates an item's built-in fields. */
export const editItemAtom = TaskTrackerClient.mutation("EditItem");

/** Completes or reopens an item, optionally confirming open descendants. */
export const setItemCompletedAtom = TaskTrackerClient.mutation("SetItemCompleted");

/** Indents an item under its preceding sibling. */
export const indentItemAtom = TaskTrackerClient.mutation("IndentItem");

/** Outdents a sub-item up one level toward the root. */
export const outdentItemAtom = TaskTrackerClient.mutation("OutdentItem");

/** Moves an item under another parent in the same area, or to the area root. */
export const moveItemAtom = TaskTrackerClient.mutation("MoveItem");

/** Sets the explicit sibling order under one parent in an area. */
export const reorderItemsAtom = TaskTrackerClient.mutation("ReorderItems");

/** Moves a top-level item and its subtree to another area in the same project. */
export const moveItemToAreaAtom = TaskTrackerClient.mutation("MoveItemToArea");

/** Soft-deletes an item subtree and returns its deletion batch ID. */
export const deleteItemAtom = TaskTrackerClient.mutation("DeleteItem");

/** Restores an item deletion batch in an area. */
export const restoreItemsAtom = TaskTrackerClient.mutation("RestoreItems");

/** Sets or clears only an item's priority, as the row menus do. */
export const setItemPriorityAtom = TaskTrackerClient.mutation("SetItemPriority");

/** Assigns a workflow status, using the normal completion and reopen rules. */
export const setItemStatusAtom = TaskTrackerClient.mutation("SetItemStatus");
