import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import type { ReminderEntry } from "@task-tracker/contracts";
import { Exit } from "effect";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { locateSearchItemAtom } from "../rpc/search-queries.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { notify } from "../state/dialog-store.js";
import { carryItemEditor, openItemEditor } from "../state/item-editor-store.js";
import { useReminderPanelStore } from "../state/reminder-panel-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { areaTarget } from "../workspace/area-route.js";

/** Shown when a reminder's item was deleted after it was delivered. */
export const REMINDER_ITEM_MISSING = "This item is no longer available.";

/**
 * Opens a reminder's item in the editor, in the area that holds it now. Unsaved
 * drafts are asked about first, and Cancel keeps the panel open.
 */
export function useOpenReminder(runGuards: ReturnGuard) {
  const navigate = useNavigate();
  const locate = useAtomSet(locateSearchItemAtom, { mode: "promiseExit" });

  return async (entry: typeof ReminderEntry.Type) => {
    if (!(await runGuards())) {
      return;
    }
    const exit = await locate({ payload: { itemId: entry.itemId } });
    if (Exit.isFailure(exit)) {
      await notify({ title: "Reminder", message: describeRpcFailure(exit.cause) });
      return;
    }
    if (exit.value === null) {
      await notify({ title: "Reminder", message: REMINDER_ITEM_MISSING });
      return;
    }
    const { projectId, folderId } = exit.value;
    const key = areaKey(projectId, folderId);
    useReminderPanelStore.getState().setOpen(false);
    useReturnPageStore.getState().uncover();
    useWorkspaceStore.getState().setPendingRowFocus({ itemId: entry.itemId, areaKey: key });
    openItemEditor(entry.itemId);
    carryItemEditor({ itemId: entry.itemId, areaKey: key });
    await navigate(areaTarget(projectId, folderId));
  };
}
