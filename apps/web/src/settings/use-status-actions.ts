import { useAtomSet } from "@effect/atom-react";
import type { StatusKind, StatusProjection } from "@task-tracker/contracts";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { reportFailure } from "../dialogs/report-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { IN_PROGRESS_KEY } from "../rpc/in-progress-queries.js";
import { LOOKUPS_KEY } from "../rpc/lookup-queries.js";
import { TaskTrackerClient } from "../rpc/task-tracker-client.js";
import { prompt } from "../state/dialog-store.js";
import { moveActiveLookup, swapActiveLookup } from "./lookup-order.js";

const addAtom = TaskTrackerClient.mutation("AddStatus");
const renameAtom = TaskTrackerClient.mutation("RenameStatus");
const archiveAtom = TaskTrackerClient.mutation("ArchiveStatus");
const restoreAtom = TaskTrackerClient.mutation("RestoreStatus");
const reorderAtom = TaskTrackerClient.mutation("ReorderStatuses");
const setInProgressAtom = TaskTrackerClient.mutation("SetStatusInProgress");

type Status = typeof StatusProjection.Type;

/** Saves status lookup edits and refreshes the settings list and item surfaces. */
export function useStatusActions() {
  const options = { mode: "promiseExit" } as const;
  const reactivityKeys = [LOOKUPS_KEY, HISTORY_KEY];
  const add = useAtomSet(addAtom, options);
  const rename = useAtomSet(renameAtom, options);
  const archive = useAtomSet(archiveAtom, options);
  const restore = useAtomSet(restoreAtom, options);
  const reorder = useAtomSet(reorderAtom, options);
  const setInProgress = useAtomSet(setInProgressAtom, options);

  const saveOrder = async (ids: readonly string[] | null) =>
    ids !== null &&
    reportFailure("Status validation", await reorder({ payload: { ids }, reactivityKeys }));

  return {
    add: async (name: string, kind: typeof StatusKind.Type) =>
      reportFailure("Status validation", await add({ payload: { name, kind }, reactivityKeys })),
    rename: async (row: Pick<Status, "id" | "name">) => {
      const name = await prompt({
        title: "Rename status",
        label: "Name",
        initialValue: row.name,
        confirmLabel: "Rename",
        validation: NAME_VALIDATION,
      });
      if (name !== null) {
        await reportFailure(
          "Status validation",
          await rename({ payload: { id: row.id, name }, reactivityKeys }),
        );
      }
    },
    archive: async (id: string) =>
      reportFailure("Status validation", await archive({ payload: { id }, reactivityKeys })),
    restore: async (id: string) =>
      reportFailure("Status validation", await restore({ payload: { id }, reactivityKeys })),
    setInProgress: async (id: string, isInProgress: boolean) =>
      reportFailure(
        "Status validation",
        await setInProgress({
          payload: { id, isInProgress },
          reactivityKeys: [...reactivityKeys, IN_PROGRESS_KEY],
        }),
      ),
    move: (rows: readonly Status[], id: string, direction: -1 | 1) =>
      saveOrder(swapActiveLookup(rows, id, direction)),
    dragReorder: (rows: readonly Status[], draggedId: string, targetId: string) =>
      saveOrder(moveActiveLookup(rows, draggedId, targetId)),
  };
}
