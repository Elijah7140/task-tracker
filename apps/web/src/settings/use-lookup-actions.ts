import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import {
  addItemTypeAtom,
  addPriorityLevelAtom,
  archiveItemTypeAtom,
  archivePriorityLevelAtom,
  ITEM_TYPES_KEY,
  LOOKUPS_KEY,
  PRIORITY_LEVELS_KEY,
  reorderItemTypesAtom,
  reorderPriorityLevelsAtom,
  renameItemTypeAtom,
  renamePriorityLevelAtom,
  restoreItemTypeAtom,
  restorePriorityLevelAtom,
} from "../rpc/lookup-queries.js";
import { notify, prompt } from "../state/dialog-store.js";
import { moveActiveLookup, type OrderedLookup, swapActiveLookup } from "./lookup-order.js";

/** Which lookup list is being edited. */
export type LookupKind = "itemTypes" | "priorityLevels";

/** Shared shape of item types and priority levels rendered in lookup settings. */
export interface LookupItem extends OrderedLookup {
  readonly name: string;
  readonly isBuiltIn: boolean;
}

async function runLookupMutation(
  action: () => Promise<Exit.Exit<unknown, RpcFailure>>,
): Promise<boolean> {
  const exit = await action();
  if (Exit.isSuccess(exit)) {
    return true;
  }
  await notify({ title: "Lookup validation", message: describeRpcFailure(exit.cause) });
  return false;
}

/**
 * Provides immediate add, rename, reorder, archive and restore mutations for
 * either item types or priority levels, showing server validation errors.
 */
export function useLookupActions(kind: LookupKind) {
  const isItemType = kind === "itemTypes";
  const singular = isItemType ? "item type" : "priority level";
  const reactivityKeys = [isItemType ? ITEM_TYPES_KEY : PRIORITY_LEVELS_KEY, LOOKUPS_KEY];

  const addAtom = useAtomSet(isItemType ? addItemTypeAtom : addPriorityLevelAtom, {
    mode: "promiseExit",
  });
  const renameAtom = useAtomSet(isItemType ? renameItemTypeAtom : renamePriorityLevelAtom, {
    mode: "promiseExit",
  });
  const archiveAtom = useAtomSet(isItemType ? archiveItemTypeAtom : archivePriorityLevelAtom, {
    mode: "promiseExit",
  });
  const restoreAtom = useAtomSet(isItemType ? restoreItemTypeAtom : restorePriorityLevelAtom, {
    mode: "promiseExit",
  });
  const reorderAtom = useAtomSet(isItemType ? reorderItemTypesAtom : reorderPriorityLevelsAtom, {
    mode: "promiseExit",
  });

  const add = (name: string) =>
    runLookupMutation(() => addAtom({ payload: { name }, reactivityKeys }));

  const rename = async (row: LookupItem) => {
    const next = await prompt({
      title: `Rename ${singular}`,
      label: "Name",
      initialValue: row.name,
      confirmLabel: "Rename",
    });
    if (next !== null) {
      await runLookupMutation(() =>
        renameAtom({ payload: { id: row.id, name: next }, reactivityKeys }),
      );
    }
  };

  const archive = (row: LookupItem) =>
    runLookupMutation(() => archiveAtom({ payload: { id: row.id }, reactivityKeys }));

  const restore = (row: LookupItem) =>
    runLookupMutation(() => restoreAtom({ payload: { id: row.id }, reactivityKeys }));

  const move = async (rows: ReadonlyArray<LookupItem>, id: string, direction: -1 | 1) => {
    const ids = swapActiveLookup(rows, id, direction);
    if (ids === null) {
      return false;
    }
    return runLookupMutation(() => reorderAtom({ payload: { ids }, reactivityKeys }));
  };

  const dragReorder = async (
    rows: ReadonlyArray<LookupItem>,
    draggedId: string,
    targetId: string,
  ) => {
    const ids = moveActiveLookup(rows, draggedId, targetId);
    if (ids === null) {
      return false;
    }
    return runLookupMutation(() => reorderAtom({ payload: { ids }, reactivityKeys }));
  };

  return { add, rename, archive, restore, move, dragReorder };
}
