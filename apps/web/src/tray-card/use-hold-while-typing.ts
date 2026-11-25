import { useEffect } from "react";

/** How often a held card checks again, since a field cleared by a save fires no event. */
const RECHECK_MS = 400;

/**
 * True when the focused field holds typing that is not saved: an add line with text, or
 * notes that differ from what they were when editing began (`data-saved-value`).
 */
export function hasUnsavedTyping(element: Element | null): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return false;
  }
  const saved = element.dataset["savedValue"] ?? "";
  return element.value.trim() !== saved.trim();
}

/**
 * Tells Electron main while a focused field in the card holds unsaved typing, so Escape
 * and clicking elsewhere leave the card showing until the typing is added, saved or
 * cleared (§7.18). Outside Electron nothing listens.
 */
export function useHoldWhileTyping() {
  useEffect(() => {
    const hold = window.taskTrackerDesktop?.holdTrayCardOpen;
    if (hold === undefined) {
      return;
    }
    let held = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = () => {
      const now = hasUnsavedTyping(document.activeElement);
      if (now !== held) {
        held = now;
        hold(now);
      }
      if (now && timer === undefined) {
        timer = setInterval(check, RECHECK_MS);
      } else if (!now && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    // The field also blurs when the whole window loses focus; it keeps its typing then.
    // Otherwise look once focus has landed on the next element.
    const checkUnlessWindowBlurs = () => {
      if (document.hasFocus()) {
        setTimeout(check, 0);
      }
    };
    // A key such as Escape can clear the field; look once the page has handled it.
    const checkAfterKey = () => setTimeout(check, 0);
    const events = ["input", "focusin", "keyup"] as const;
    events.forEach((name) => document.addEventListener(name, check));
    document.addEventListener("keydown", checkAfterKey);
    document.addEventListener("focusout", checkUnlessWindowBlurs);
    return () => {
      events.forEach((name) => document.removeEventListener(name, check));
      document.removeEventListener("keydown", checkAfterKey);
      document.removeEventListener("focusout", checkUnlessWindowBlurs);
      clearInterval(timer);
    };
  }, []);
}
