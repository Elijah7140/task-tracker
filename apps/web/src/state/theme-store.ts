import { create } from "zustand";
import { isThemePreference, type ThemePreference } from "./theme-preference.js";

const STORAGE_KEY = "task-tracker.theme";

/** A new install starts dark until the user picks another theme in App Settings (§7.19). */
const DEFAULT_PREFERENCE: ThemePreference = "dark";

function readStoredPreference(): ThemePreference {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function storePreference(preference: ThemePreference) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable. The choice then lasts for this session only.
  }
}

/** The appearance preference and its setter. */
export interface ThemeState {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

/** Client-only appearance state, remembered across launches in local storage. */
export const useThemeStore = create<ThemeState>()((set) => ({
  preference: readStoredPreference(),
  setPreference: (preference) => {
    storePreference(preference);
    set({ preference });
  },
}));

/**
 * Re-reads the stored preference, for a window that stays open while another
 * window of the app changes it, such as the hidden tray card (§7.18).
 */
export function syncStoredThemePreference() {
  const preference = readStoredPreference();
  if (useThemeStore.getState().preference !== preference) {
    useThemeStore.setState({ preference });
  }
}
