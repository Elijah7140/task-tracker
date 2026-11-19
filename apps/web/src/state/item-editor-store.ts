import { create } from "zustand";
import type { CustomFieldDraft } from "../editor/custom-field-drafts.js";
import type { BuiltInKey, BuiltInOverrides } from "../editor/item-draft.js";

/**
 * The floating item editor's open item and draft. The draft holds only what
 * the user typed, keyed by field, so stored values that load or refresh later
 * never overwrite typed edits (§4: drafts stay client-side).
 */
export interface ItemEditorState {
  readonly openItemId: string | null;
  readonly builtIn: BuiltInOverrides;
  readonly custom: Readonly<Record<string, CustomFieldDraft>>;
  /** Why the last save was refused, shown in the editor until the draft changes. */
  readonly error: string | null;
  /** Opens an item with a fresh draft. */
  readonly open: (itemId: string) => void;
  /** Closes the editor and forgets its draft. */
  readonly close: () => void;
  readonly setBuiltIn: (key: BuiltInKey, value: string) => void;
  readonly setCustom: (fieldId: string, draft: CustomFieldDraft) => void;
  /** Forgets typed values so the stored ones show again, keeping the item open. */
  readonly discard: () => void;
  readonly setError: (error: string | null) => void;
}

/** The closed editor, also used to reset tests. */
export const initialItemEditorState = {
  openItemId: null,
  builtIn: {},
  custom: {},
  error: null,
} as const;

/** The item editor's session state. */
export const useItemEditorStore = create<ItemEditorState>()((set) => ({
  ...initialItemEditorState,
  open: (itemId) => set({ ...initialItemEditorState, openItemId: itemId }),
  close: () => set(initialItemEditorState),
  setBuiltIn: (key, value) =>
    set((state) => ({ builtIn: { ...state.builtIn, [key]: value }, error: null })),
  setCustom: (fieldId, draft) =>
    set((state) => ({ custom: { ...state.custom, [fieldId]: draft }, error: null })),
  discard: () => set({ builtIn: {}, custom: {}, error: null }),
  setError: (error) => set({ error }),
}));

/** Opens the floating editor for an item. */
export const openItemEditor = (itemId: string) => useItemEditorStore.getState().open(itemId);

/** True while the floating editor is open. */
export const isItemEditorOpen = () => useItemEditorStore.getState().openItemId !== null;
