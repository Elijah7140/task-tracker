import { createContext, useContext, useLayoutEffect, useRef } from "react";

type ReadBlocker = () => string | null;

/** Drafts mounted under the shell register their current reason to block history replay. */
export const UndoBlockers = createContext<((read: ReadBlocker) => () => void) | null>(null);

/** The current settings drafts share one refusal message. */
export const UNSAVED_SETTINGS_UNDO_MESSAGE =
  "Save or discard your settings before undoing or redoing.";

/** Protects a draft from replay for as long as its editor is mounted. */
export function useUndoBlocker(dirty: boolean, reason: string) {
  const register = useContext(UndoBlockers);
  const current = useRef<string | null>(null);
  current.current = dirty ? reason : null;
  useLayoutEffect(() => register?.(() => current.current), [register]);
}
