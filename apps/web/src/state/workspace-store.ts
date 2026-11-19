import { create } from "zustand";

/** A row to focus in the area with the given area key. */
export interface PendingRowFocus {
  readonly itemId: string;
  readonly areaKey: string;
}

/** Session-only workspace interaction state. Server data stays in RPC atoms. */
export interface WorkspaceState {
  /** Folders the user collapsed. Folders start expanded, as in the legacy tree. */
  readonly collapsedFolders: ReadonlySet<string>;
  /** Items whose sub-items are shown. Items start collapsed. */
  readonly expandedItems: ReadonlySet<string>;
  /** Open Completed sections, keyed by area key or parent item ID. They start collapsed (§6.2). */
  readonly expandedCompleted: ReadonlySet<string>;
  /** The focused item row, if any. */
  readonly selectedItemId: string | null;
  /** Changes even if selection moves away and then returns to an item. */
  readonly itemSelectionVersion: number;
  /** The sidebar area under an item drag, highlighted as its drop target. */
  readonly itemDropArea: { readonly folderId: string | null } | null;
  /** True while an item move saves; further moves are ignored until it finishes (§7.5). */
  readonly itemMoveSaving: boolean;
  /** A moved row to focus once the area a move followed it to renders it. */
  readonly pendingRowFocus: PendingRowFocus | null;
  readonly setItemDropArea: (area: WorkspaceState["itemDropArea"]) => void;
  readonly setItemMoveSaving: (saving: boolean) => void;
  readonly setPendingRowFocus: (request: PendingRowFocus | null) => void;
  readonly setFolderExpanded: (folderId: string, expanded: boolean) => void;
  readonly setItemExpanded: (itemId: string, expanded: boolean) => void;
  readonly setCompletedExpanded: (sectionKey: string, expanded: boolean) => void;
  readonly selectItem: (itemId: string | null) => void;
}

/** Returns a copy of the set with the key added or removed. */
function withMember(set: ReadonlySet<string>, key: string, member: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (member) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
}

/** The initial state, also used to reset tests. */
export const initialWorkspaceState = {
  collapsedFolders: new Set<string>(),
  expandedItems: new Set<string>(),
  expandedCompleted: new Set<string>(),
  selectedItemId: null,
  itemSelectionVersion: 0,
  itemDropArea: null,
  itemMoveSaving: false,
  pendingRowFocus: null,
} as const;

/** Expansion and selection for the folder tree and item trees. Lasts for the session. */
export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...initialWorkspaceState,
  setFolderExpanded: (folderId, expanded) =>
    set((state) => ({ collapsedFolders: withMember(state.collapsedFolders, folderId, !expanded) })),
  setItemExpanded: (itemId, expanded) =>
    set((state) => ({ expandedItems: withMember(state.expandedItems, itemId, expanded) })),
  setCompletedExpanded: (sectionKey, expanded) =>
    set((state) => ({
      expandedCompleted: withMember(state.expandedCompleted, sectionKey, expanded),
    })),
  selectItem: (itemId) =>
    set((state) =>
      state.selectedItemId === itemId
        ? state
        : { selectedItemId: itemId, itemSelectionVersion: state.itemSelectionVersion + 1 },
    ),
  setItemDropArea: (itemDropArea) => set({ itemDropArea }),
  setItemMoveSaving: (itemMoveSaving) => set({ itemMoveSaving }),
  setPendingRowFocus: (pendingRowFocus) => set({ pendingRowFocus }),
}));
