import { isBlankText, type ItemEdit } from "@task-tracker/contracts";
import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { Exit } from "effect";
import type { AddKind } from "../add/add-item-draft.js";
import { useAddItemStore } from "../add/add-item-store.js";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { requestCompletion } from "../dialogs/request-completion.js";
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
import { isItemEditorOpen, openItemEditor } from "../state/item-editor-store.js";
import { noticeCompletion } from "../state/status-notice-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { itemTarget } from "./area-route.js";
import { departureFocusIds, isEmptyLevel, itemAncestorIds, type ItemNode } from "./item-outline.js";
import {
  focusAfterDeparture,
  type ItemStructureScope,
  reportItemFailure,
  useItemStructureActions,
} from "./use-item-structure-actions.js";
import { useItemDropActions } from "./use-item-drop-actions.js";
import { usePushBackOneDay } from "./use-push-back-one-day.js";
import { useSetItemPriority } from "./use-set-item-priority.js";
import { useRepeatActions } from "./use-repeat-actions.js";
import { useSetItemStatus } from "./use-set-item-status.js";
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
    if (isBlankText(title)) {
      return false;
    }
    const exit = await create({
      payload: {
        projectId: scope.projectId,
        folderId: scope.folderId,
        parentItemId: scope.levelParentId ?? null,
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

  /**
   * The outline's inline add on a card (§7.17): a titled ToDo under `parentItemId`, placed
   * right after `afterItemId` when given, else appended. Resolves the new item's ID, or
   * null when nothing was created.
   */
  const addOutlineItem = async (
    parentItemId: string,
    title: string,
    afterItemId?: string,
  ): Promise<string | null> => {
    if (isBlankText(title)) {
      return null;
    }
    const placement = afterItemId === undefined ? {} : { afterItemId };
    const exit = await create({
      payload: {
        projectId: scope.projectId,
        folderId: scope.folderId,
        parentItemId,
        title,
        ...placement,
      },
      reactivityKeys: keys,
    });
    if (!(await reportItemFailure(exit)) || !Exit.isSuccess(exit)) {
      return null;
    }
    return exit.value.id;
  };

  return { quickAdd, addSubItem, addOutlineItem };
}

/** The built-in fields EditItem takes, copied from the item with `changes` applied. */
function editedFields(item: ItemNode["item"], changes: Partial<typeof ItemEdit.Type>) {
  const { title, description, ticketNumber, itemTypeId, priorityLevelId, dueDate, dueTime } = item;
  const fields = {
    title,
    description,
    ticketNumber,
    itemTypeId,
    priorityLevelId,
    dueDate,
    dueTime,
  };
  return { ...fields, ...changes };
}

function useEditFields(scope: ItemActionScope) {
  const edit = useAtomSet(editItemAtom, { mode: "promiseExit" });
  const keys = [HISTORY_KEY, areaKey(scope.projectId, scope.folderId)];
  return async (node: ItemNode, changes: Partial<typeof ItemEdit.Type>) => {
    const fields = editedFields(node.item, changes);
    const exit = await edit({ payload: { itemId: node.item.id, fields }, reactivityKeys: keys });
    return reportItemFailure(exit);
  };
}

function useRenameItem(scope: ItemActionScope) {
  const editFields = useEditFields(scope);

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
    if (await editFields(node, { title })) {
      scope.onFocusItem({ id: node.item.id, afterNodes: scope.items });
    }
  };
}

/**
 * Saves a card's inline-edited notes, the item's Markdown description (§7.10, §7.17), as
 * one undoable edit. Blank notes clear the description. Resolves true once saved or
 * when nothing changed.
 */
function useSaveNotes(scope: ItemActionScope) {
  const editFields = useEditFields(scope);
  return async (node: ItemNode, notes: string): Promise<boolean> => {
    const description = isBlankText(notes) ? null : notes;
    if (description === (node.item.description ?? null)) {
      return true;
    }
    return editFields(node, { description });
  };
}

/** Sets only the item's priority from a row menu, then returns focus to the row. */
function useSetPriority(scope: ItemActionScope) {
  const setPriority = useSetItemPriority();
  return async (node: ItemNode, priorityLevelId: string | null) => {
    if (await setPriority(node.item, priorityLevelId)) {
      scope.onFocusItem({ id: node.item.id, afterNodes: scope.items });
    }
  };
}

/** Completes or reopens an item and returns focus after an applied change. */
function useToggleComplete(scope: ItemActionScope) {
  const setCompleted = useAtomSet(setItemCompletedAtom, { mode: "promiseExit" });
  const keys = [HISTORY_KEY, areaKey(scope.projectId, scope.folderId), PROJECTS_KEY];

  return async (node: ItemNode) => {
    const base = {
      projectId: scope.projectId,
      folderId: scope.folderId,
      itemId: node.item.id,
      completed: node.item.completedAtUtc === null,
    };
    const exit = await requestCompletion((approval) =>
      setCompleted({
        payload: approval === undefined ? base : { ...base, confirmedOpenItemIds: approval },
        reactivityKeys: keys,
      }),
    );
    if (exit === undefined || !(await reportItemFailure(exit)) || !Exit.isSuccess(exit)) {
      return;
    }
    if (exit.value.kind === "blocked") {
      await notify({ title: "Cannot reopen item", message: exit.value.reason });
    } else if (exit.value.kind === "applied") {
      noticeCompletion(exit.value);
      scope.onFocusItem({
        id: node.item.id,
        afterNodes: scope.items,
        fallbackIds: departureFocusIds(scope.items, node),
      });
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

/**
 * Drill-in (§7.19): double-clicking a card shows that item's children as cards with its
 * details beside them. The item stays selected, so returning to its level keeps it in view.
 */
function useOpenItem(scope: ItemActionScope) {
  const navigate = useNavigate();
  return (node: ItemNode) => {
    useWorkspaceStore.getState().selectItem(node.item.id);
    void navigate(itemTarget(scope.projectId, scope.folderId, node.item.id));
  };
}

/** Opens the add dialog for a ToDo or Ticket under `parentItemId` (§7.19). */
function addItem(kind: AddKind, parentItemId: string | null) {
  useAddItemStore.getState().open({ kind, parentItemId, detailed: null });
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
  const { quickAdd, addSubItem, addOutlineItem } = useCreateItemActions(scope);
  const { deleteItem, restoreBatch } = useDeleteAndRestore(scope);
  const structure = useItemStructureActions(scope);
  const setStatus = useSetItemStatus();
  const repeat = useRepeatActions();
  const pushBack = usePushBackOneDay();
  const refocus = (node: ItemNode) => (applied: boolean) => {
    if (applied) {
      scope.onFocusItem({ id: node.item.id, afterNodes: scope.items });
    }
  };
  return {
    editItem: openEditor,
    openItem: useOpenItem(scope),
    addItem,
    quickAdd,
    addSubItem: once("addSubItem", addSubItem),
    addOutlineItem,
    saveNotes: useSaveNotes(scope),
    renameItem: once("renameItem", useRenameItem(scope)),
    setPriority: once("setPriority", useSetPriority(scope)),
    toggleComplete: once("toggleComplete", useToggleComplete(scope)),
    setStatus: once("setStatus", async (node: ItemNode, statusId: string | null) => {
      if (await setStatus(node.item, statusId)) {
        scope.onFocusItem({
          id: node.item.id,
          afterNodes: scope.items,
          fallbackIds: departureFocusIds(scope.items, node),
        });
      }
    }),
    skipRepeat: once("skipRepeat", (node: ItemNode) =>
      repeat.skipRepeat(node.item).then(refocus(node)),
    ),
    stopRepeating: once("stopRepeating", (node: ItemNode) =>
      repeat.stopRepeating(node.item).then(refocus(node)),
    ),
    // The editor keeps focus when Ctrl+Shift+P pushes back its item from there.
    pushBack: once("pushBack", (node: ItemNode) =>
      pushBack(node.item).then((applied) => refocus(node)(applied && !isItemEditorOpen())),
    ),
    deleteItem: once("deleteItem", deleteItem),
    restoreBatch,
    indentItem: once("indentItem", structure.indentItem),
    outdentItem: once("outdentItem", structure.outdentItem),
    moveItemParent: once("moveItemParent", structure.moveItemParent),
    moveItemToArea: once("moveItemToArea", structure.moveItemToArea),
    reorderByOffset: structure.reorderByOffset,
    dropItem: useItemDropActions(scope),
  };
}

/** Action callbacks returned by {@link useItemActions}. */
export type ItemActions = ReturnType<typeof useItemActions>;
