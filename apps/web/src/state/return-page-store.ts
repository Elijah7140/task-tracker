import type { SavedSearchProjection } from "@task-tracker/contracts";
import { create } from "zustand";

/** A screen shown over the routed page while keeping that page, and any draft, mounted. */
export type CoveringPage = "trash" | "calendar" | "search";

/** A saved search that Search opens with. Each request has a new version, so Search remounts. */
export interface SavedSearchRequest {
  readonly savedSearch: typeof SavedSearchProjection.Type;
  readonly version: number;
}

/**
 * Trash, Calendar and Search share one return page (§7.4, §7.6). The routed
 * page stays mounted behind the covering page. `stale`
 * records that a change may have altered the page behind, so returning asks
 * its unsaved-changes guard. `busy` holds Back and Escape while a change or
 * its confirmation is in progress.
 */
export interface ReturnPageState {
  readonly covering: CoveringPage | null;
  /** The workspace project the covering page was opened from, if any. */
  readonly originProjectId: string | null;
  /** The workspace folder the covering page was opened from, if any. */
  readonly originFolderId: string | null;
  readonly stale: boolean;
  readonly busy: boolean;
  /** The saved search the shown Search page opened with, if any (§7.7). */
  readonly searchRequest: SavedSearchRequest | null;
  /**
   * Shows a covering page. Switching between covering pages keeps the original return
   * target and its out-of-date flag. Nothing changes while a change is running.
   */
  readonly cover: (
    page: CoveringPage,
    originProjectId: string | null,
    originFolderId?: string | null,
  ) => void;
  /**
   * Shows Search with a saved search applied and its scope origin. An open Search page
   * is replaced, keeping the original return page and its out-of-date flag (§7.7).
   * Nothing changes while a change is running.
   */
  readonly openSavedSearch: (
    savedSearch: typeof SavedSearchProjection.Type,
    originProjectId: string | null,
    originFolderId: string | null,
  ) => void;
  /** Hides the covering page and clears the out-of-date flag. */
  readonly uncover: () => void;
  readonly markStale: () => void;
  readonly setBusy: (busy: boolean) => void;
}

/** No covering page, also used to reset tests. */
export const initialReturnPageState = {
  covering: null,
  originProjectId: null,
  originFolderId: null,
  stale: false,
  busy: false,
  searchRequest: null,
} as const;

/** The shell's covering page and its return-page flags. */
export const useReturnPageStore = create<ReturnPageState>()((set) => ({
  ...initialReturnPageState,
  cover: (page, originProjectId, originFolderId = null) =>
    set((state) => {
      if (state.busy || state.covering === page) {
        return state;
      }
      return state.covering === null
        ? { ...initialReturnPageState, covering: page, originProjectId, originFolderId }
        : { covering: page, searchRequest: null };
    }),
  openSavedSearch: (savedSearch, originProjectId, originFolderId) =>
    set((state) => {
      if (state.busy) {
        return state;
      }
      const version = (state.searchRequest?.version ?? 0) + 1;
      const opened = { covering: "search", originProjectId, originFolderId } as const;
      const searchRequest = { savedSearch, version };
      return state.covering === null
        ? { ...initialReturnPageState, ...opened, searchRequest }
        : { ...opened, searchRequest };
    }),
  uncover: () => set(initialReturnPageState),
  markStale: () => set((state) => (state.covering === null ? state : { stale: true })),
  setBusy: (busy) => set({ busy }),
}));

/** True while a covering page hides the routed page. */
export const isPageCovered = () => useReturnPageStore.getState().covering !== null;

/** Marks the page behind a covering page out of date. Without one it does nothing. */
export const markReturnPageStale = () => useReturnPageStore.getState().markStale();
