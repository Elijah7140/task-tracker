import { useAtomSet } from "@effect/atom-react";
import { useEffect } from "react";
import { IN_PROGRESS_KEY } from "../rpc/in-progress-queries.js";
import { invalidateKeysAtom } from "../rpc/invalidate-keys.js";
import { syncStoredThemePreference } from "../state/theme-store.js";

/**
 * Reads the in-progress stack and theme again each time the card window is
 * shown or focused, since either may have changed meanwhile (§7.18). Urgency
 * also moves on with time, so a refocused pop-out window shows it afresh.
 */
export function useReloadWhenShown() {
  const invalidate = useAtomSet(invalidateKeysAtom);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") {
        syncStoredThemePreference();
        invalidate([IN_PROGRESS_KEY]);
      }
    };
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("focus", reload);
    return () => {
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("focus", reload);
    };
  }, [invalidate]);
}
