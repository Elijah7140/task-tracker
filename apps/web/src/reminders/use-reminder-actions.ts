import { useAtomSet } from "@effect/atom-react";
import type { ReminderEntry, ReminderSnooze } from "@task-tracker/contracts";
import { Exit } from "effect";
import { requestCompletion } from "../dialogs/request-completion.js";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { setItemCompletedAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { dismissReminderAtom, snoozeReminderAtom } from "../rpc/reminder-queries.js";
import { locateSearchItemAtom } from "../rpc/search-queries.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { notify } from "../state/dialog-store.js";
import { REMINDER_ITEM_MISSING, useOpenReminder } from "./use-open-reminder.js";

type Entry = typeof ReminderEntry.Type;

const failed = (message: string) => notify({ title: "Reminder", message });

/**
 * The panel's Open, Mark complete, Snooze and Dismiss actions (§7.12). Every
 * change goes to the server, which publishes the updated panel.
 */
export function useReminderActions(runGuards: ReturnGuard) {
  const open = useOpenReminder(runGuards);
  const locate = useAtomSet(locateSearchItemAtom, { mode: "promiseExit" });
  const setCompleted = useAtomSet(setItemCompletedAtom, { mode: "promiseExit" });
  const snoozeRequest = useAtomSet(snoozeReminderAtom, { mode: "promiseExit" });
  const dismissRequest = useAtomSet(dismissReminderAtom, { mode: "promiseExit" });

  const dismiss = async (entry: Entry) => {
    const exit = await dismissRequest({ payload: { itemId: entry.itemId } });
    if (Exit.isFailure(exit)) {
      await failed(describeRpcFailure(exit.cause));
    }
  };

  const snooze = async (entry: Entry, option: typeof ReminderSnooze.Type) => {
    const payload = { itemId: entry.itemId, instantUtc: entry.instantUtc, option };
    const exit = await snoozeRequest({ payload, reactivityKeys: [HISTORY_KEY] });
    if (Exit.isFailure(exit)) {
      await failed(describeRpcFailure(exit.cause));
    }
  };

  /** Completes the item where it lives now. A blocked completion explains why. */
  const complete = async (entry: Entry) => {
    const located = await locate({ payload: { itemId: entry.itemId } });
    if (Exit.isFailure(located) || located.value === null) {
      const message = Exit.isFailure(located)
        ? describeRpcFailure(located.cause)
        : REMINDER_ITEM_MISSING;
      await failed(message);
      return;
    }
    const { projectId, folderId } = located.value;
    const base = { projectId, folderId, itemId: entry.itemId, completed: true };
    const exit = await requestCompletion((approval) =>
      setCompleted({
        payload: approval === undefined ? base : { ...base, confirmedOpenItemIds: approval },
        reactivityKeys: [HISTORY_KEY, areaKey(projectId, folderId), PROJECTS_KEY],
      }),
    );
    if (exit === undefined) {
      return;
    }
    if (Exit.isFailure(exit)) {
      await failed(describeRpcFailure(exit.cause));
    } else if (exit.value.kind === "blocked") {
      await notify({ title: "Cannot complete item", message: exit.value.reason });
    } else {
      await dismiss(entry);
    }
  };

  return { open, complete, snooze, dismiss };
}
