import { useAtomSet } from "@effect/atom-react";
import { type CompletionResult, isBlankText } from "@task-tracker/contracts";
import { Exit } from "effect";
import { useState } from "react";
import { announceDataChanged } from "../native/data-change-broadcast.js";
import { openItemFromTrayCard } from "../native/open-item-from-tray-card.js";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { IN_PROGRESS_KEY } from "../rpc/in-progress-queries.js";
import { createItemAtom, editItemAtom, setItemCompletedAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { markCompletedHere, rememberCompletion } from "../state/completed-here-store.js";
import type { ItemNode } from "../workspace/item-outline.js";
import { editedFields, type ItemActions } from "../workspace/use-item-actions.js";
import { useSingleRunPerItem } from "../workspace/use-single-run-per-item.js";

/** The area a tray card's item belongs to. Every write of the card goes to it. */
export interface TrayCardArea {
  readonly projectId: string;
  readonly folderId: string | null;
}

/** Open sub-items the card asks about before completing an item and them too. */
export interface PendingSubItems {
  readonly node: ItemNode;
  readonly count: number;
  readonly itemIds: ReadonlyArray<string>;
  /** True when the open sub-items changed after the user was first asked. */
  readonly changed: boolean;
}

/** What the card shows under itself: the sub-items question or why a write failed. */
export interface TrayCardFeedback {
  readonly busy: boolean;
  readonly pending: PendingSubItems | null;
  readonly message: string | null;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
}

type Exited<Value> = Exit.Exit<Value, RpcFailure>;

/** Shared state of one card's writes: the question, the message and the busy flag. */
function useFeedbackState() {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSubItems | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Shows a failure and resolves whether the write succeeded, telling other windows if so. */
  const settle = <Value>(exit: Exited<Value>): exit is Exit.Success<Value, RpcFailure> => {
    if (Exit.isFailure(exit)) {
      setMessage(describeRpcFailure(exit.cause));
      return false;
    }
    announceDataChanged();
    return true;
  };
  return { busy, setBusy, pending, setPending, message, setMessage, settle };
}

type FeedbackState = ReturnType<typeof useFeedbackState>;

/**
 * Completing or reopening an item of the card. The tray card shows no dialogs, so the open
 * sub-items question and any refusal appear under the card. Approval is a new request with
 * the approved IDs, which the server revalidates (§4). As in the workspace, a completed item
 * is remembered first, so with Auto-hide completed off it stays in place (§6.2).
 */
function useCompletion(area: TrayCardArea, keys: ReadonlyArray<string>, state: FeedbackState) {
  const setCompleted = useAtomSet(setItemCompletedAtom, { mode: "promiseExit" });
  const receive = (node: ItemNode, result: typeof CompletionResult.Type, asked: boolean) => {
    if (result.kind === "needs-confirmation") {
      const { openSubItemCount: count, openSubItemIds: itemIds } = result;
      state.setPending({ node, count, itemIds, changed: asked });
    } else if (result.kind === "blocked") {
      state.setMessage(result.reason);
    }
  };
  return async (node: ItemNode, approval?: ReadonlyArray<string>) => {
    const completed = node.item.completedAtUtc === null;
    const { projectId, folderId } = area;
    const base = { projectId, folderId, itemId: node.item.id, completed };
    if (completed) {
      markCompletedHere([node.item.id]);
    }
    state.setBusy(true);
    state.setPending(null);
    state.setMessage(null);
    const exit = await setCompleted({
      payload: approval === undefined ? base : { ...base, confirmedOpenItemIds: approval },
      reactivityKeys: [...keys],
    });
    state.setBusy(false);
    rememberCompletion(node.item.id, Exit.isSuccess(exit) ? exit.value : undefined);
    if (state.settle(exit)) {
      receive(node, exit.value, approval !== undefined);
    }
  };
}

/** Adds a titled ToDo from the card's add line or an outline row's inline add (§7.17). */
function useAddOutlineItem(area: TrayCardArea, keys: ReadonlyArray<string>, state: FeedbackState) {
  const create = useAtomSet(createItemAtom, { mode: "promiseExit" });
  return async (parentItemId: string, title: string, afterItemId?: string) => {
    if (isBlankText(title)) {
      return null;
    }
    state.setMessage(null);
    const { projectId, folderId } = area;
    const placement = afterItemId === undefined ? {} : { afterItemId };
    const exit = await create({
      payload: { projectId, folderId, parentItemId, title, ...placement },
      reactivityKeys: [...keys],
    });
    return state.settle(exit) ? exit.value.id : null;
  };
}

/** Saves the card's inline notes as one undoable edit; blank notes clear them (§7.17). */
function useSaveNotes(keys: ReadonlyArray<string>, state: FeedbackState) {
  const edit = useAtomSet(editItemAtom, { mode: "promiseExit" });
  return async (node: ItemNode, notes: string) => {
    const saved = isBlankText(notes) ? null : notes;
    if (saved === (node.item.notes ?? null)) {
      return true;
    }
    state.setMessage(null);
    const fields = editedFields(node.item, { notes: saved });
    const exit = await edit({
      payload: { itemId: node.item.id, fields },
      reactivityKeys: [...keys],
    });
    return state.settle(exit);
  };
}

/** Brings the main window forward with the item opened, as clicking a tray row did. */
const openInMainWindow = (node: ItemNode) => void openItemFromTrayCard(node.item.id);

const nothing = async () => undefined;

/**
 * Card controls the tray card does not offer (§7.18): menus, drags, add dialogs, renames,
 * deletes and moves. Its cards never call them.
 */
const UNOFFERED = {
  addItem: () => undefined,
  quickAdd: async () => false,
  addSubItem: nothing,
  renameItem: nothing,
  setPriority: nothing,
  setStatus: nothing,
  skipRepeat: nothing,
  stopRepeating: nothing,
  pushBack: nothing,
  deleteItem: nothing,
  restoreBatch: nothing,
  indentItem: nothing,
  outdentItem: nothing,
  moveItemParent: nothing,
  moveItemToArea: nothing,
  reorderByOffset: nothing,
  dropItem: nothing,
  setDetailOnCard: nothing,
} satisfies Partial<ItemActions>;

/**
 * The item actions of one tray card (§7.18): complete and reopen, add from the add lines,
 * save notes, and open in the main window. Writes use the workspace's requests, so each is
 * the same undo step, and every applied write tells the app's other windows to reload.
 */
export function useTrayCardActions(area: TrayCardArea): {
  readonly actions: ItemActions;
  readonly feedback: TrayCardFeedback;
} {
  const keys = [HISTORY_KEY, IN_PROGRESS_KEY, areaKey(area.projectId, area.folderId), PROJECTS_KEY];
  const once = useSingleRunPerItem();
  const state = useFeedbackState();
  const complete = useCompletion(area, keys, state);
  const actions: ItemActions = {
    ...UNOFFERED,
    editItem: openInMainWindow,
    openItem: openInMainWindow,
    addOutlineItem: useAddOutlineItem(area, keys, state),
    saveNotes: useSaveNotes(keys, state),
    toggleComplete: once("toggleComplete", (node: ItemNode) => complete(node)),
  };
  const { pending } = state;
  const feedback: TrayCardFeedback = {
    busy: state.busy,
    pending,
    message: state.message,
    confirm: () => (pending === null ? nothing() : complete(pending.node, pending.itemIds)),
    cancel: () => state.setPending(null),
  };
  return { actions, feedback };
}
