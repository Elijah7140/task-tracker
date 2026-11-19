import { create } from "zustand";
import { isThemePreference, type ThemePreference } from "./theme-preference.js";

const STORAGE_KEY = "task-tracker.theme";

function readStoredPreference(): ThemePreference {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
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
