import { useBlocker } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { confirm } from "../state/dialog-store.js";

/**
 * Prompts before leaving a settings route when `isDirty` is true.
 * Calling `bypass()` lets programmatic redirects (such as a deleted project)
 * leave without asking to discard.
 */
export function useUnsavedSettingsGuard(isDirty: boolean, message: string) {
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const bypassedRef = useRef(false);

  useBlocker({
    shouldBlockFn: async () => {
      if (bypassedRef.current || !dirtyRef.current) {
        return false;
      }
      const discard = await confirm({
        title: "Discard unsaved settings?",
        message,
        confirmLabel: "Discard",
      });
      return !discard;
    },
    enableBeforeUnload: false,
  });

  const bypass = useCallback(() => {
    bypassedRef.current = true;
  }, []);

  return { bypass };
}
