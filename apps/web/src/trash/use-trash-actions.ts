import { useAtomSet } from "@effect/atom-react";
import type { TrashBatch } from "@task-tracker/contracts";
import { Exit } from "effect";
import { useRef, useState } from "react";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import {
  emptyTrashAtom,
  PURGE_REACTIVITY_KEYS,
  purgeTrashBatchAtom,
  RESTORE_REACTIVITY_KEYS,
  restoreTrashBatchAtom,
} from "../rpc/trash-queries.js";
import { confirm } from "../state/dialog-store.js";
import { markReturnPageStale, useReturnPageStore } from "../state/return-page-store.js";
import { trashEntries, trashKindLabel } from "./trash-row-labels.js";

type Batch = typeof TrashBatch.Type;
type ChangeExit = Exit.Exit<unknown, RpcFailure>;

function purgeMessage(batch: Batch) {
  const kind = trashKindLabel(batch.kind).toLowerCase();
  const earlier =
    batch.kind === "project" && batch.earlierBatchCount > 0
      ? ` This also deletes the ${trashEntries(batch.earlierBatchCount)} deleted from this project earlier.`
      : "";
  return `Permanently delete the ${kind} '${batch.title}' and everything deleted with it?${earlier} This cannot be undone.`;
}

const irreversible = (title: string, message: string) =>
  confirm({ title, message, confirmLabel: title, tone: "danger", cancelIsDefault: true });

/** Options for {@link useTrashActions}. */
export interface TrashActionScope {
  readonly projectId: string | null;
  readonly batches: ReadonlyArray<Batch>;
  /** Reloads the list after a failed change, which often means it was out of date. */
  readonly reload: () => void;
}

/**
 * Restore, Delete permanently and Empty trash, one change at a time (§7.6).
 * The page is busy from the confirmation until the change finishes. A failure
 * is shown inline and the list reloads.
 */
export function useTrashActions({ projectId, batches, reload }: TrashActionScope) {
  const restore = useAtomSet(restoreTrashBatchAtom, { mode: "promiseExit" });
  const purge = useAtomSet(purgeTrashBatchAtom, { mode: "promiseExit" });
  const empty = useAtomSet(emptyTrashAtom, { mode: "promiseExit" });
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const latest = useRef({ projectId, batches, reload });
  latest.current = { projectId, batches, reload };

  const exclusively = async (work: () => Promise<ChangeExit | undefined>) => {
    if (running.current) {
      return;
    }
    running.current = true;
    useReturnPageStore.getState().setBusy(true);
    try {
      const exit = await work();
      if (exit !== undefined && Exit.isFailure(exit)) {
        setError(describeRpcFailure(exit.cause));
        latest.current.reload();
      }
    } finally {
      running.current = false;
      useReturnPageStore.getState().setBusy(false);
    }
  };

  const change = (run: () => Promise<ChangeExit>) => {
    setError(null);
    return run();
  };

  const restoreBatch = (batch: Batch) =>
    exclusively(() => {
      markReturnPageStale();
      return change(() =>
        restore({ payload: { batchId: batch.batchId }, reactivityKeys: RESTORE_REACTIVITY_KEYS }),
      );
    });

  const purgeBatch = (batch: Batch) =>
    exclusively(async () =>
      (await irreversible("Delete permanently", purgeMessage(batch)))
        ? change(() =>
            purge({ payload: { batchId: batch.batchId }, reactivityKeys: PURGE_REACTIVITY_KEYS }),
          )
        : undefined,
    );

  const emptyTrash = () =>
    exclusively(async () => {
      const scope = latest.current;
      const message = `Permanently delete ${trashEntries(scope.batches.length)} in the trash? This cannot be undone.`;
      return (await irreversible("Empty trash", message))
        ? change(() =>
            empty({
              payload: { projectId: scope.projectId },
              reactivityKeys: PURGE_REACTIVITY_KEYS,
            }),
          )
        : undefined;
    });

  return { error, clearError: () => setError(null), restoreBatch, purgeBatch, emptyTrash };
}
