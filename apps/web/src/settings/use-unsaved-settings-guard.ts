import { useBlocker } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { useReturnGuard } from "../shell/return-guards.js";
import { UNSAVED_SETTINGS_UNDO_MESSAGE, useUndoBlocker } from "../shell/undo-blockers.js";
import { confirm } from "../state/dialog-store.js";

/**
 * Prompts before leaving a settings route when `isDirty` is true, and before
 * returning to it from a covering page that may have changed it or opening a
 * result from one (§7.8). Discarding on return calls `discard`, which reloads
 * the form from the server; the page then reports itself clean. Calling
 * `bypass()` lets programmatic redirects (such as a deleted project) leave
 * without asking to discard.
 */
export function useUnsavedSettingsGuard(isDirty: boolean, message: string, discard: () => void) {
  useUndoBlocker(isDirty, UNSAVED_SETTINGS_UNDO_MESSAGE);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const bypassedRef = useRef(false);

  const confirmDiscard = useCallback(async () => {
    if (bypassedRef.current || !dirtyRef.current) {
      return true;
    }
    return confirm({ title: "Discard unsaved settings?", message, confirmLabel: "Discard" });
  }, [message]);

  useBlocker({
    shouldBlockFn: async () => !(await confirmDiscard()),
    enableBeforeUnload: false,
  });

  useReturnGuard(async () => {
    const wasDirty = dirtyRef.current && !bypassedRef.current;
    if (!(await confirmDiscard())) {
      return false;
    }
    if (wasDirty) {
      // A navigation that follows, such as opening a calendar entry, must not ask again.
      dirtyRef.current = false;
      discard();
    }
    return true;
  });

  const bypass = useCallback(() => {
    bypassedRef.current = true;
  }, []);

  return { bypass };
}
