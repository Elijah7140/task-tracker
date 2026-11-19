import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { areaKey } from "../rpc/area-queries.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import {
  createItemAtom,
  deleteItemAtom,
  editItemAtom,
  restoreItemsAtom,
  setItemCompletedAtom,
} from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { confirm, notify, prompt } from "../state/dialog-store.js";
import { openItemEditor } from "../state/item-editor-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { departureFocusIds, isEmptyLevel, itemAncestorIds, type ItemNode } from "./item-outline.js";
import {
  focusAfterDeparture,
  type ItemStructureScope,
  reportItemFailure,
  useItemStructureActions,
} from "./use-item-structure-actions.js";
import { useSingleRunPerItem } from "./use-single-run-per-item.js";

/** Info for the undo banner shown after deleting an item subtree. */
export interface DeletedItemNotice {
  readonly batchId: string;
  /** The deleted subtree's root, focused again after Undo. */
  readonly itemId: string;
  readonly title: string;
  readonly projectId: string;
  readonly folderId: string | null;
}

/** Scope and callbacks required by {@link useItemActions}. */
export interface ItemActionScope extends ItemStructureScope {
  readonly onDeleted: (notice: DeletedItemNotice) => void;
}

function useCreateItemActions(scope: ItemActionScope) {
  const create = useAtomSet(createItemAtom, { mode: "promiseExit" });
  const keys = [HISTORY_KEY, areaKey(scope.projectId, scope.folderId), PROJECTS_KEY];

  const quickAdd = async (title: string): Promise<boolean> => {
    if (title.trim().length === 0) {
      return false;
    }
    const exit = await create({
      payload: {
        projectId: scope.projectId,
        folderId: scope.folderId,
        parentItemId: null,
        title,
      },
      reactivityKeys: keys,
    });
    if (!(await reportItemFailure(exit)) || !Exit.isSuccess(exit)) {
      return false;
    }
    useWorkspaceStore.getState().selectItem(exit.value.id);
    return true;
  };

  const addSubItem = async (parent: ItemNode) => {
    const title = await prompt({
      title: "New sub-item",
      label: "Title",
      confirmLabel: "Add",
      validation: NAME_VALIDATION,
    });
    if (title === null) {
      return;
    }
    const exit = await create({
      payload: {
        projectId: scope.projectId,
        folderId: scope.folderId,
        parentItemId: parent.item.id,
        title,
      },
      reactivityKeys: keys,
    });
    if ((await reportItemFailure(exit)) && Exit.isSuccess(exit)) {
      const { selectItem, setItemExpanded } = useWorkspaceStore.getState();
      for (const ancestorId of itemAncestorIds(scope.items, parent.item.id)) {
        setItemExpanded(ancestorId, true);
      }
      setItemExpanded(parent.item.id, true);
      selectItem(exit.value.id);
      scope.onFocusItem({ id: exit.value.id, expectedParentId: parent.item.id });
    }
  };

  return { quickAdd, addSubItem };
}

function useRenameItem(scope: ItemActionScope) {
  const edit = useAtomSet(editItemAtom, { mode: "promiseExit" });
  const keys = [HISTORY_KEY, areaKey(scope.projectId, scope.folderId)];

  return async (node: ItemNode) => {
    const title = await prompt({
      title: "Rename item",
      label: "Title",
      initialValue: node.item.title,
      confirmLabel: "Rename",
      validation: NAME_VALIDATION,
    });
    if (title === null) {
      return;
    }
    const {
      id,
      description,
      ticketNumber,
      itemTypeId,
      priorityLevelId,
      dueDate,
      dueTime,
      scheduledStart,
      scheduledEnd,
    } = node.item;
    const fields = {
      title,
      description,
      ticketNumber,
      itemTypeId,
      priorityLevelId,
      dueDate,
      dueTime,
      scheduledStart,
      scheduledEnd,
    };
    const exit = await edit({ payload: { itemId: id, fields }, reactivityKeys: keys });
    if (await reportItemFailure(exit)) {
      scope.onFocusItem({ id, afterNodes: scope.items });
    }
  };
}

function confirmationMessage(count: number, refreshed: boolean): string {
  const noun = count === 1 ? "sub-item" : "sub-items";
  return refreshed
    ? `Open sub-items changed. Also complete ${count} open ${noun}?`
    : `Also complete ${count} open ${noun}?`;
}

/** The outcome of one SetItemCompleted request, after any notice it needs. */
type CompletionStep =
  | { readonly kind: "done"; readonly applied: boolean }
  | {
      readonly kind: "confirm";
      readonly openSubItemIds: ReadonlyArray<string>;
      readonly count: number;
    };

function useSetCompletedStep(scope: ItemActionScope) {
  const setCompleted = useAtomSet(setItemCompletedAtom, { mode: "promiseExit" });
  const keys = [HISTORY_KEY, areaKey(scope.projectId, scope.folderId), PROJECTS_KEY];

  return async (
    node: ItemNode,
    confirmedOpenItemIds: ReadonlyArray<string> | undefined,
  ): Promise<CompletionStep> => {
    const base = {
      projectId: scope.projectId,
      folderId: scope.folderId,
      itemId: node.item.id,
      completed: node.item.completedAtUtc === null,
    };
    const payload = confirmedOpenItemIds === undefined ? base : { ...base, confirmedOpenItemIds };
    const exit = await setCompleted({ payload, reactivityKeys: keys });
    if (!(await reportItemFailure(exit)) || !Exit.isSuccess(exit)) {
      return { kind: "done", applied: false };
    }
    const result = exit.value;
    if (result.kind === "blocked") {
      await notify({ title: "Cannot reopen item", message: result.reason });
    }
    return result.kind === "needs-confirmation"
      ? { kind: "confirm", openSubItemIds: result.openSubItemIds, count: result.openSubItemCount }
      : { kind: "done", applied: result.kind === "applied" };
  };
}

/**
 * Completes or reopens an item, asking before completing open sub-items and
 * asking again if they changed meanwhile. Focus then follows the item or, when
 * it left the open list, moves to a neighbouring row.
 */
function useToggleComplete(scope: ItemActionScope) {
  const step = useSetCompletedStep(scope);

  return async (node: ItemNode) => {
    let confirmedOpenItemIds: ReadonlyArray<string> | undefined;
    for (;;) {
      const outcome = await step(node, confirmedOpenItemIds);
      if (outcome.kind === "done") {
        if (outcome.applied) {
          const fallbackIds = departureFocusIds(scope.items, node);
          scope.onFocusItem({ id: node.item.id, afterNodes: scope.items, fallbackIds });
        }
        return;
      }
      const approved = await confirm({
        title: "Complete sub-items",
        message: confirmationMessage(outcome.count, confirmedOpenItemIds !== undefined),
        confirmLabel: "Complete",
      });
      if (!approved) {
        return;
      }
      confirmedOpenItemIds = outcome.openSubItemIds;
    }
  };
}

function useDeleteAndRestore(scope: ItemActionScope) {
  const remove = useAtomSet(deleteItemAtom, { mode: "promiseExit" });
  const restore = useAtomSet(restoreItemsAtom, { mode: "promiseExit" });

  const deleteItem = async (node: ItemNode) => {
    const message = !isEmptyLevel(node.children)
      ? `Delete ${node.item.title} and its sub-items?`
      : `Delete ${node.item.title}?`;
    const confirmed = await confirm({
      title: "Delete item",
      message,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    const exit = await remove({
      payload: { projectId: scope.projectId, folderId: scope.folderId, itemId: node.item.id },
      reactivityKeys: [HISTORY_KEY, areaKey(scope.projectId, scope.folderId), PROJECTS_KEY],
    });
    if ((await reportItemFailure(exit)) && Exit.isSuccess(exit)) {
      focusAfterDeparture(scope, node);
      scope.onDeleted({
        batchId: exit.value,
        itemId: node.item.id,
        title: node.item.title,
        projectId: scope.projectId,
        folderId: scope.folderId,
      });
    }
  };

  const restoreBatch = async (batch: DeletedItemNotice) => {
    const exit = await restore({
      payload: {
        projectId: batch.projectId,
        folderId: batch.folderId,
        batchId: batch.batchId,
      },
      reactivityKeys: [HISTORY_KEY, areaKey(batch.projectId, batch.folderId), PROJECTS_KEY],
    });
    if (await reportItemFailure(exit)) {
      scope.onFocusItem({ id: batch.itemId, afterNodes: scope.items, fallbackIds: [] });
    }
  };

  return { deleteItem, restoreBatch };
}

/** Selects an item and opens it in the floating editor (§8). */
function openEditor(node: ItemNode) {
  useWorkspaceStore.getState().selectItem(node.item.id);
  openItemEditor(node.item.id);
}

/**
 * All item actions for an area (the legacy AreaItemsViewModel commands plus
 * Notion-style indent/outdent and moves). Each mutation invalidates area and
 * project reactivity keys and reports server failures through the shared dialog.
 * A repeated run of an action on the same item is ignored while the first is in
 * progress, and reorders run one at a time.
 */
export function useItemActions(scope: ItemActionScope) {
  const once = useSingleRunPerItem();
  const { quickAdd, addSubItem } = useCreateItemActions(scope);
  const { deleteItem, restoreBatch } = useDeleteAndRestore(scope);
  const structure = useItemStructureActions(scope);
  return {
    editItem: openEditor,
    quickAdd,
    addSubItem: once("addSubItem", addSubItem),
    renameItem: once("renameItem", useRenameItem(scope)),
    toggleComplete: once("toggleComplete", useToggleComplete(scope)),
    deleteItem: once("deleteItem", deleteItem),
    restoreBatch,
    indentItem: once("indentItem", structure.indentItem),
    outdentItem: once("outdentItem", structure.outdentItem),
    moveItemParent: once("moveItemParent", structure.moveItemParent),
    moveItemToArea: once("moveItemToArea", structure.moveItemToArea),
    reorderByOffset: structure.reorderByOffset,
    reorderByDrop: structure.reorderByDrop,
  };
}

/** Action callbacks returned by {@link useItemActions}. */
export type ItemActions = ReturnType<typeof useItemActions>;
