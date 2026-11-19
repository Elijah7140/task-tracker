import { create } from "zustand";

/** A screen shown over the routed page while keeping that page, and any draft, mounted. */
export type CoveringPage = "trash" | "calendar" | "search";

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
  /**
   * Shows a covering page. Switching between covering pages keeps the original return
   * target and its out-of-date flag. Nothing changes while a change is running.
   */
  readonly cover: (
    page: CoveringPage,
    originProjectId: string | null,
    originFolderId?: string | null,
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
        : { covering: page };
    }),
  uncover: () => set(initialReturnPageState),
  markStale: () => set((state) => (state.covering === null ? state : { stale: true })),
  setBusy: (busy) => set({ busy }),
}));

/** True while a covering page hides the routed page. */
export const isPageCovered = () => useReturnPageStore.getState().covering !== null;

/** Marks the page behind a covering page out of date. Without one it does nothing. */
export const markReturnPageStale = () => useReturnPageStore.getState().markStale();

/**
 * Hides any covering page for the user's navigation, such as a sidebar link.
 * Returns false, leaving it shown, while one of its changes is running, so
 * the navigation should not happen. Redirects of the page behind keep it.
 */
export function leaveCoveringPageForNavigation(): boolean {
  const { busy, uncover } = useReturnPageStore.getState();
  if (busy) {
    return false;
  }
  uncover();
  return true;
}
