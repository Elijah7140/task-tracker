import { create } from "zustand";

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
  selectItem: (itemId) => set({ selectedItemId: itemId }),
}));
