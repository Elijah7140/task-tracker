import { trimText } from "@task-tracker/contracts";
import { useAtomSet } from "@effect/atom-react";
import type { Exit } from "effect";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { reportFailure } from "../dialogs/report-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import {
  addPriorityLevelAtom,
  archivePriorityLevelAtom,
  LOOKUPS_KEY,
  PRIORITY_LEVELS_KEY,
  reorderPriorityLevelsAtom,
  renamePriorityLevelAtom,
  restorePriorityLevelAtom,
  setPriorityNumberAtom,
} from "../rpc/lookup-queries.js";
import { notify, prompt } from "../state/dialog-store.js";
import { moveActiveLookup, type OrderedLookup, swapActiveLookup } from "./lookup-order.js";

/** Which lookup list is being edited. Item types were removed on 25 Nov 2026. */
export type LookupKind = "priorityLevels";

/** The shape of a priority level rendered in lookup settings. */
export interface LookupItem extends OrderedLookup {
  readonly name: string;
  readonly isBuiltIn: boolean;
  readonly number?: number | null;
  readonly label?: string;
}

/** Runs one lookup mutation and shows a rejection. Resolves with whether it succeeded. */
async function runLookupMutation(
  action: () => Promise<Exit.Exit<unknown, RpcFailure>>,
): Promise<boolean> {
  return reportFailure("Lookup validation", await action());
}

/**
 * Parses the Number box: blank clears the number, otherwise a whole number of at least 1.
 * Shows the legacy message for anything else and resolves false without a request.
 */
async function withPriorityNumber(text: string, save: (number: number | null) => Promise<boolean>) {
  const trimmed = trimText(text);
  if (trimmed === "") {
    return save(null);
  }
  const number = Number(trimmed);
  if (/^\d+$/.test(trimmed) && Number.isSafeInteger(number) && number >= 1) {
    return save(number);
  }
  await notify({
    title: "Lookup validation",
    message: "Enter a whole priority number of at least 1, or leave it blank.",
  });
  return false;
}

/** The add, rename, archive and restore RPC mutations for the priority list. */
function useLookupMutations() {
  const options = { mode: "promiseExit" } as const;
  return {
    addPriority: useAtomSet(addPriorityLevelAtom, options),
    setNumber: useAtomSet(setPriorityNumberAtom, options),
    rename: useAtomSet(renamePriorityLevelAtom, options),
    archive: useAtomSet(archivePriorityLevelAtom, options),
    restore: useAtomSet(restorePriorityLevelAtom, options),
  };
}

/** Saves `ids` as the new order, or resolves false without a request when nothing moved. */
function useSaveOrder(reactivityKeys: Array<string>) {
  const reorder = useAtomSet(reorderPriorityLevelsAtom, { mode: "promiseExit" });
  return async (ids: ReadonlyArray<string> | null) =>
    ids === null ? false : runLookupMutation(() => reorder({ payload: { ids }, reactivityKeys }));
}

/**
 * Provides immediate add, rename, reorder, archive and restore mutations for the priority
 * levels, showing server validation errors.
 */
export function useLookupActions(_kind: LookupKind) {
  const singular = "priority level";
  // Every list change records an undo step, so the Edit menu label refreshes too.
  const reactivityKeys = [PRIORITY_LEVELS_KEY, LOOKUPS_KEY, HISTORY_KEY];
  const mutations = useLookupMutations();
  const saveOrder = useSaveOrder(reactivityKeys);

  const rename = async (row: LookupItem) => {
    const name = await prompt({
      title: `Rename ${singular}`,
      label: "Name",
      initialValue: row.name,
      confirmLabel: "Rename",
      validation: row.number == null ? NAME_VALIDATION : undefined,
    });
    if (name !== null) {
      await runLookupMutation(() =>
        mutations.rename({ payload: { id: row.id, name }, reactivityKeys }),
      );
    }
  };

  return {
    add: (name: string, numberText: string) =>
      withPriorityNumber(numberText, (number) =>
        runLookupMutation(() =>
          mutations.addPriority({ payload: { name, number }, reactivityKeys }),
        ),
      ),
    setNumber: (id: string, numberText: string) =>
      withPriorityNumber(numberText, (number) =>
        runLookupMutation(() => mutations.setNumber({ payload: { id, number }, reactivityKeys })),
      ),
    rename,
    archive: (row: LookupItem) =>
      runLookupMutation(() => mutations.archive({ payload: { id: row.id }, reactivityKeys })),
    restore: (row: LookupItem) =>
      runLookupMutation(() => mutations.restore({ payload: { id: row.id }, reactivityKeys })),
    move: (rows: ReadonlyArray<LookupItem>, id: string, direction: -1 | 1) =>
      saveOrder(swapActiveLookup(rows, id, direction)),
    dragReorder: (rows: ReadonlyArray<LookupItem>, draggedId: string, targetId: string) =>
      saveOrder(moveActiveLookup(rows, draggedId, targetId)),
  };
}
