import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { areaKey } from "../rpc/area-queries.js";
import {
  createItemAtom,
  deleteItemAtom,
  editItemAtom,
  restoreItemsAtom,
  setItemCompletedAtom,
} from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { confirm, notify, prompt } from "../state/dialog-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { itemAncestorIds, type ItemNode } from "./item-outline.js";
import {
  type ItemStructureScope,
  reportItemFailure,
  useItemStructureActions,
} from "./use-item-structure-actions.js";

/** Info for the undo banner shown after deleting an item subtree. */
export interface DeletedItemNotice {
  readonly batchId: string;
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
  const keys = [areaKey(scope.projectId, scope.folderId), PROJECTS_KEY];

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
    const title = await prompt({ title: "New sub-item", label: "Title", confirmLabel: "Add" });
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
  const keys = [areaKey(scope.projectId, scope.folderId)];

  return async (node: ItemNode) => {
    const title = await prompt({
      title: "Rename item",
      label: "Title",
      initialValue: node.item.title,
      confirmLabel: "Rename",
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

function useToggleComplete(scope: ItemActionScope) {
  const setCompleted = useAtomSet(setItemCompletedAtom, { mode: "promiseExit" });
  const keys = [areaKey(scope.projectId, scope.folderId), PROJECTS_KEY];

  return async (node: ItemNode) => {
    const completed = node.item.completedAtUtc === null;
    let confirmedOpenItemIds: ReadonlyArray<string> | undefined;

    for (;;) {
      const base = {
        projectId: scope.projectId,
        folderId: scope.folderId,
        itemId: node.item.id,
        completed,
      };
      const payload = confirmedOpenItemIds === undefined ? base : { ...base, confirmedOpenItemIds };
      const exit = await setCompleted({ payload, reactivityKeys: keys });
      if (!(await reportItemFailure(exit)) || !Exit.isSuccess(exit)) {
        return;
      }
      const result = exit.value;
      if (result.kind === "applied") {
        return;
      }
      if (result.kind === "blocked") {
        await notify({ title: "Cannot reopen item", message: result.reason });
        return;
      }
      const approved = await confirm({
        title: "Complete sub-items",
        message: confirmationMessage(result.openSubItemCount, confirmedOpenItemIds !== undefined),
        confirmLabel: "Complete",
      });
      if (!approved) {
        return;
      }
      confirmedOpenItemIds = result.openSubItemIds;
    }
  };
}

function useDeleteAndRestore(scope: ItemActionScope) {
  const remove = useAtomSet(deleteItemAtom, { mode: "promiseExit" });
  const restore = useAtomSet(restoreItemsAtom, { mode: "promiseExit" });

  const deleteItem = async (node: ItemNode) => {
    const message =
      node.children.length > 0
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
      reactivityKeys: [areaKey(scope.projectId, scope.folderId), PROJECTS_KEY],
    });
    if ((await reportItemFailure(exit)) && Exit.isSuccess(exit)) {
      const parentId = node.item.parentItemId;
      useWorkspaceStore.getState().selectItem(parentId);
      if (parentId !== null) {
        scope.onFocusItem({ id: parentId, afterNodes: scope.items });
      }
      scope.onDeleted({
        batchId: exit.value,
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
      reactivityKeys: [areaKey(batch.projectId, batch.folderId), PROJECTS_KEY],
    });
    await reportItemFailure(exit);
  };

  return { deleteItem, restoreBatch };
}

/**
 * All item actions for an area (the legacy AreaItemsViewModel commands plus
 * Notion-style indent/outdent and moves). Each mutation invalidates area and
 * project reactivity keys and reports server failures through the shared dialog.
 */
export function useItemActions(scope: ItemActionScope) {
  return {
    ...useCreateItemActions(scope),
    renameItem: useRenameItem(scope),
    toggleComplete: useToggleComplete(scope),
    ...useDeleteAndRestore(scope),
    ...useItemStructureActions(scope),
  };
}

/** Action callbacks returned by {@link useItemActions}. */
export type ItemActions = ReturnType<typeof useItemActions>;
