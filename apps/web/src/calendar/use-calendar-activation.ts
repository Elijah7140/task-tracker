import { useAtomSet } from "@effect/atom-react";
import type { CalendarItemLocation } from "@task-tracker/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type Cause, Exit } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { areaKey } from "../rpc/area-queries.js";
import { locateCalendarItemAtom } from "../rpc/calendar-queries.js";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { missingEntityMessage } from "../rpc/missing-entity.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { areaTarget } from "../workspace/area-route.js";
import type { CalendarOccurrence } from "./calendar-layout.js";

/** Shown when an activated entry's item was deleted after the calendar loaded (§7.4). */
export const MISSING_CALENDAR_ITEM_MESSAGE = "This item no longer exists";

/** Options for {@link useCalendarActivation}. */
export interface CalendarActivationOptions {
  readonly runGuards: ReturnGuard;
  readonly reload: () => void;
}

/** Opens the located item's folder with the item selected, leaving the calendar. */
async function openLocatedItem(
  location: typeof CalendarItemLocation.Type,
  navigate: ReturnType<typeof useNavigate>,
) {
  const { itemId, projectId, folderId } = location;
  useWorkspaceStore.getState().setPendingRowFocus({
    itemId,
    areaKey: areaKey(projectId, folderId),
  });
  useReturnPageStore.getState().uncover();
  await navigate(areaTarget(projectId, folderId));
}

/** The message for a failed lookup; a deleted item also reloads the calendar. */
function locateFailureMessage(cause: Cause.Cause<RpcFailure>, reload: () => void) {
  if (missingEntityMessage(cause, "Item") === undefined) {
    return describeRpcFailure(cause);
  }
  reload();
  return MISSING_CALENDAR_ITEM_MESSAGE;
}

/**
 * Guarded entry activation for Calendar (§7.4). Resolves the item's current
 * workspace folder on the server, asks the return page's unsaved-changes guard
 * once, and opens and selects the item. A second activation while one is
 * pending is ignored. An activation still pending when the calendar is left is
 * dropped. A deleted item reloads the calendar and reports
 * {@link MISSING_CALENDAR_ITEM_MESSAGE}.
 */
export function useCalendarActivation({ runGuards, reload }: CalendarActivationOptions) {
  const locate = useAtomSet(locateCalendarItemAtom, { mode: "promiseExit" });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const latest = useRef({ runGuards, reload });
  latest.current = { runGuards, reload };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canActivate = () => {
    const { covering, busy } = useReturnPageStore.getState();
    return mounted.current && covering === "calendar" && !busy;
  };

  const run = async (itemId: string) => {
    const exit = await locate({ payload: { itemId } });
    if (!canActivate()) {
      return;
    }
    if (Exit.isFailure(exit)) {
      setError(locateFailureMessage(exit.cause, latest.current.reload));
      return;
    }
    const canLeave = await latest.current.runGuards();
    if (canLeave && canActivate()) {
      await openLocatedItem(exit.value, navigate);
    }
  };

  const activate = async (occurrence: CalendarOccurrence) => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setError(null);
    try {
      await run(occurrence.entry.itemId);
    } finally {
      pending.current = false;
    }
  };

  const clearError = useCallback(() => setError(null), []);

  return { error, clearError, activate };
}
