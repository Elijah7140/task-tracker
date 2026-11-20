import { create } from "zustand";

const STORAGE_KEY = "task-tracker.sidebar-expanded";

function readStoredExpanded(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeExpanded(expanded: boolean) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(expanded));
  } catch {
    // Storage can be unavailable. The choice then lasts for this session only.
  }
}

/** Whether the navigation sidebar shows names and folders, and its setter. */
export interface SidebarState {
  readonly expanded: boolean;
  readonly setExpanded: (expanded: boolean) => void;
}

/**
 * The sidebar's width, a per-device preference remembered in local storage (§7.19). It
 * starts collapsed to an icon rail until the user expands it.
 */
export const useSidebarStore = create<SidebarState>()((set) => ({
  expanded: readStoredExpanded(),
  setExpanded: (expanded) => {
    storeExpanded(expanded);
    set({ expanded });
  },
}));
