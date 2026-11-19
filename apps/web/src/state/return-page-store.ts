import { create } from "zustand";

/** A screen shown over the routed page while keeping that page, and any draft, mounted. */
export type CoveringPage = "trash" | "calendar";

/**
 * The single return page shared by Trash, Calendar and later Search (§7.4,
 * §7.6). Covering pages never stack: opening one over another replaces it and
 * keeps the original page, origin and `stale` flag. The routed page stays
 * mounted behind the covering page. `stale`
 * records that a change may have altered the page behind, so returning asks
 * its unsaved-changes guard. `busy` holds Back and Escape while a change or
 * its confirmation is in progress.
 */
export interface ReturnPageState {
  readonly covering: CoveringPage | null;
  /** The workspace project the covering page was opened from, if any. */
  readonly originProjectId: string | null;
  readonly stale: boolean;
  readonly busy: boolean;
  /** Shows a covering page, replacing another one but keeping its origin. Ignored while busy. */
  readonly cover: (page: CoveringPage, originProjectId: string | null) => void;
  /** Hides the covering page and clears the out-of-date flag. */
  readonly uncover: () => void;
  readonly markStale: () => void;
  readonly setBusy: (busy: boolean) => void;
}

/** No covering page, also used to reset tests. */
export const initialReturnPageState = {
  covering: null,
  originProjectId: null,
  stale: false,
  busy: false,
} as const;

/** The shell's covering page and its return-page flags. */
export const useReturnPageStore = create<ReturnPageState>()((set) => ({
  ...initialReturnPageState,
  cover: (page, originProjectId) =>
    set((state) => {
      if (state.busy) {
        return state;
      }
      if (state.covering === null) {
        return { covering: page, originProjectId, stale: false, busy: false };
      }
      return state.covering === page ? state : { ...state, covering: page, busy: false };
    }),
  uncover: () => set(initialReturnPageState),
  markStale: () => set((state) => (state.covering === null ? state : { stale: true })),
  setBusy: (busy) => set({ busy }),
}));

/** True while a covering page hides the routed page. */
export const isPageCovered = () => useReturnPageStore.getState().covering !== null;

/** Marks the page behind a covering page out of date. Without one it does nothing. */
export const markReturnPageStale = () => useReturnPageStore.getState().markStale();
