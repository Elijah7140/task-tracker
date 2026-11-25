import { useAtomSet } from "@effect/atom-react";
import { useEffect } from "react";
import { HISTORY_REPLAY_KEY } from "../rpc/history-queries.js";
import { IN_PROGRESS_KEY } from "../rpc/in-progress-queries.js";
import { invalidateKeysAtom } from "../rpc/invalidate-keys.js";
import { SETTINGS_KEY } from "../rpc/settings-queries.js";
import { syncStoredThemePreference } from "../state/theme-store.js";

/**
 * Reads the in-progress stack, the cards' areas, the settings and the theme again
 * each time the card window is shown or focused, since any may have changed
 * meanwhile (§7.18). Urgency also moves on with time, so a refocused pop-out
 * window shows it afresh. The replay key reloads every area and the settings.
 */
export function useReloadWhenShown() {
  const invalidate = useAtomSet(invalidateKeysAtom);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") {
        syncStoredThemePreference();
        invalidate([IN_PROGRESS_KEY, HISTORY_REPLAY_KEY, SETTINGS_KEY]);
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
