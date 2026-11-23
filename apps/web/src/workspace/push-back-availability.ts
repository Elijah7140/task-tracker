import type { Shortcut } from "../ui/keyboard-shortcut.js";

/** Ctrl+Shift+P pushes back the selected or focused item (§7.14). */
export const PUSH_BACK_SHORTCUT: Shortcut = { key: "p", ctrl: true, shift: true };

/** The shortcut as a menu row shows it and as `aria-keyshortcuts` names it. */
export const PUSH_BACK_SHORTCUT_HINT = { label: "Ctrl+Shift+P", keys: "Control+Shift+P" } as const;

/** What the row shows about an item that decides whether it can be pushed back. */
export interface PushBackState {
  readonly isCompleted: boolean;
  readonly hasDates: boolean;
}

/**
 * Why Push back one day is disabled for a row, or null when it is available.
 * The server applies the same rule and has the final say (§7.14).
 */
export function pushBackReason({ isCompleted, hasDates }: PushBackState): string | null {
  if (isCompleted) {
    return "Completed items cannot be pushed back.";
  }
  return hasDates ? null : "This item has no due date.";
}

/** The push back state of a workspace item record. */
export function itemPushBackState(item: {
  readonly completedAtUtc: string | null;
  readonly dueDate: string | null;
}): PushBackState {
  return {
    isCompleted: item.completedAtUtc !== null,
    hasDates: item.dueDate !== null,
  };
}
