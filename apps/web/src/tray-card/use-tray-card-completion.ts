import { useAtomSet } from "@effect/atom-react";
import type { CompletionResult, InProgressItem } from "@task-tracker/contracts";
import { Exit } from "effect";
import { useState } from "react";
import { announceDataChanged } from "../native/data-change-broadcast.js";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { IN_PROGRESS_KEY } from "../rpc/in-progress-queries.js";
import { setItemCompletedAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";

/** What completing a row needs: the item and the area that holds it. */
type Card = Pick<typeof InProgressItem.Type, "itemId" | "projectId" | "folderId">;
type Result = typeof CompletionResult.Type;

/** Open sub-items the card asks about before completing them too. */
export interface PendingSubItems {
  readonly count: number;
  readonly itemIds: ReadonlyArray<string>;
  /** True when the open sub-items changed after the user was first asked. */
  readonly changed: boolean;
}

/** The card's completion state: in flight, waiting for approval, or explaining a refusal. */
export interface TrayCardCompletion {
  readonly busy: boolean;
  readonly pending: PendingSubItems | null;
  readonly message: string | null;
  readonly complete: () => Promise<void>;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
}

/**
 * Completing a row of the tray card's stack. The card is too small for the
 * app's dialogs, so the open sub-items question and any refusal appear under
 * the row. Approval is
 * a new request with the approved IDs, which the server revalidates (§4). Other
 * windows hear about an applied completion and reload.
 */
export function useTrayCardCompletion(card: Card): TrayCardCompletion {
  const setCompleted = useAtomSet(setItemCompletedAtom, { mode: "promiseExit" });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSubItems | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const receive = (result: Result, asked: boolean) => {
    if (result.kind === "needs-confirmation") {
      setPending({
        count: result.openSubItemCount,
        itemIds: result.openSubItemIds,
        changed: asked,
      });
    } else if (result.kind === "blocked") {
      setMessage(result.reason);
    } else {
      announceDataChanged();
    }
  };

  const run = async (approval: ReadonlyArray<string> | undefined) => {
    const { itemId, projectId, folderId } = card;
    const base = { projectId, folderId, itemId, completed: true };
    setBusy(true);
    setPending(null);
    setMessage(null);
    const exit = await setCompleted({
      payload: approval === undefined ? base : { ...base, confirmedOpenItemIds: approval },
      reactivityKeys: [HISTORY_KEY, IN_PROGRESS_KEY, areaKey(projectId, folderId), PROJECTS_KEY],
    });
    setBusy(false);
    if (Exit.isFailure(exit)) {
      setMessage(describeRpcFailure(exit.cause));
    } else {
      receive(exit.value, approval !== undefined);
    }
  };

  return {
    busy,
    pending,
    message,
    complete: () => run(undefined),
    confirm: () => run(pending?.itemIds ?? []),
    cancel: () => setPending(null),
  };
}
