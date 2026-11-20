import { useAtomSet } from "@effect/atom-react";
import { useEffect } from "react";
import { CURRENT_ITEM_KEY } from "../rpc/current-item-queries.js";
import { invalidateKeysAtom } from "../rpc/invalidate-keys.js";
import { syncStoredThemePreference } from "../state/theme-store.js";

/**
 * Reads the current item and theme again each time the card window is shown,
 * since either may have changed while it was hidden (§7.18).
 */
export function useReloadWhenShown() {
  const invalidate = useAtomSet(invalidateKeysAtom);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") {
        syncStoredThemePreference();
        invalidate([CURRENT_ITEM_KEY]);
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
