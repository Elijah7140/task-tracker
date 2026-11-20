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

/** Places an item before, after or inside a target row, validated against the current tree. */
export const dropItemAtom = TaskTrackerClient.mutation("DropItem");

/** Moves an item to the top level at an index and assigns a priority in one undoable write (§7.17). */
export const moveItemToPriorityGroupAtom = TaskTrackerClient.mutation("MoveItemToPriorityGroup");

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

/** Moves an open repeating item to its next date; false means the rule had no next date (§7.11). */
export const skipRepeatAtom = TaskTrackerClient.mutation("SkipRepeat");

/** Removes the repeat rule from one occurrence (§7.11). */
export const stopRepeatingAtom = TaskTrackerClient.mutation("StopRepeating");

/** Moves an open item's due date and scheduled block one calendar day later (§7.14). */
export const pushBackOneDayAtom = TaskTrackerClient.mutation("PushBackOneDay");

/** Adds a ToDo or Ticket with its fields from quick add or the detailed add view (§7.19). */
export const addItemAtom = TaskTrackerClient.mutation("AddItem");

/** Appends a comment to a ticket's log (§7.19). */
export const addTicketCommentAtom = TaskTrackerClient.mutation("AddTicketComment");
