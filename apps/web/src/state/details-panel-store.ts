import { create } from "zustand";

const STORAGE_KEY = "task-tracker.details-panel-collapsed";

/** The stored choice: collapsed only when the user collapsed it; a new install shows the details. */
export function readStoredCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeCollapsed(collapsed: boolean) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Storage can be unavailable. The choice then lasts for this session only.
  }
}

/** Whether a drilled-in item's details are collapsed out of the way, and its setter. */
export interface DetailsPanelState {
  readonly collapsed: boolean;
  readonly setCollapsed: (collapsed: boolean) => void;
}

/**
 * Whether the drill-in details panel or band is collapsed (§7.19), a per-device preference
 * remembered in local storage. It applies at the side and at the top alike.
 */
export const useDetailsPanelStore = create<DetailsPanelState>()((set) => ({
  collapsed: readStoredCollapsed(),
  setCollapsed: (collapsed) => {
    storeCollapsed(collapsed);
    set({ collapsed });
  },
}));
