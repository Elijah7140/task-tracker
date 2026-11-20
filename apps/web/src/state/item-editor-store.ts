import type { ReminderChoice } from "@task-tracker/contracts";
import { create } from "zustand";
import type { CustomFieldDraft } from "../editor/custom-field-drafts.js";
import type { BuiltInKey, BuiltInOverrides } from "../editor/item-draft.js";
import { EMPTY_LINK_DRAFT, type LinkDraft } from "../editor/link-draft.js";
import type { RepeatDraft } from "../editor/repeat-draft.js";
import type { TicketOverrides, TicketTexts } from "../editor/ticket-draft.js";

/**
 * The floating item editor's open item and draft. The draft holds only what
 * the user typed, keyed by field, so stored values that load or refresh later
 * never overwrite typed edits (§4: drafts stay client-side).
 */
export interface ItemEditorState {
  readonly openItemId: string | null;
  readonly builtIn: BuiltInOverrides;
  readonly custom: Readonly<Record<string, CustomFieldDraft>>;
  /** The Links section's edited list and entry boxes (§7.10). */
  readonly links: LinkDraft;
  /** The Repeat section's controls once the user changes one; null shows the stored rule (§7.11). */
  readonly repeat: RepeatDraft | null;
  /** The Reminder choice once the user changes it; null shows the stored choice (§7.12). */
  readonly reminder: typeof ReminderChoice.Type | null;
  /** A ticket's changed fixed fields, by field (§7.19). */
  readonly ticket: TicketOverrides;
  /** Why the last save was refused, shown in the editor until the draft changes. */
  readonly error: string | null;
  /** An open item whose draft follows it into the area an item move navigates to. */
  readonly carried: CarriedEditor | null;
  /** Opens an item with a fresh draft. */
  readonly open: (itemId: string) => void;
  /** Closes the editor and forgets its draft. */
  readonly close: () => void;
  readonly setBuiltIn: (key: BuiltInKey, value: string) => void;
  readonly setCustom: (fieldId: string, draft: CustomFieldDraft) => void;
  /** Applies a change to the link draft, such as adding or reordering a link. */
  readonly updateLinks: (change: (draft: LinkDraft) => LinkDraft) => void;
  /** Replaces the Repeat section's draft. */
  readonly setRepeat: (draft: RepeatDraft) => void;
  /** Replaces the Reminder choice. */
  readonly setReminder: (choice: typeof ReminderChoice.Type) => void;
  /** Records changes to a ticket's fixed fields. */
  readonly setTicket: (change: Partial<TicketTexts>) => void;
  /** Forgets typed values so the stored ones show again, keeping the item open. */
  readonly discard: () => void;
  readonly setError: (error: string | null) => void;
}

/** The closed editor, also used to reset tests. */
export const initialItemEditorState = {
  openItemId: null,
  builtIn: {},
  custom: {},
  links: EMPTY_LINK_DRAFT,
  repeat: null,
  reminder: null,
  ticket: {},
  error: null,
  carried: null,
} as const;

/** The open item and the area key of the area an item move is carrying the editor to. */
export interface CarriedEditor {
  readonly itemId: string;
  readonly areaKey: string;
}

/** The item editor's session state. */
export const useItemEditorStore = create<ItemEditorState>()((set) => ({
  ...initialItemEditorState,
  open: (itemId) => set({ ...initialItemEditorState, openItemId: itemId }),
  close: () => set(initialItemEditorState),
  setBuiltIn: (key, value) =>
    set((state) => ({ builtIn: { ...state.builtIn, [key]: value }, error: null })),
  setCustom: (fieldId, draft) =>
    set((state) => ({ custom: { ...state.custom, [fieldId]: draft }, error: null })),
  updateLinks: (change) => set((state) => ({ links: change(state.links), error: null })),
  setRepeat: (repeat) => set({ repeat, error: null }),
  setReminder: (reminder) => set({ reminder, error: null }),
  setTicket: (change) => set((state) => ({ ticket: { ...state.ticket, ...change }, error: null })),
  discard: () =>
    set({
      builtIn: {},
      custom: {},
      links: EMPTY_LINK_DRAFT,
      repeat: null,
      reminder: null,
      ticket: {},
      error: null,
    }),
  setError: (error) => set({ error }),
}));

/** Opens the floating editor for an item. */
export const openItemEditor = (itemId: string) => useItemEditorStore.getState().open(itemId);

/** True while the floating editor is open. */
export const isItemEditorOpen = () => useItemEditorStore.getState().openItemId !== null;

/** True when the open editor holds typed values that have not been saved or discarded. */
export const hasItemEditorEdits = () => {
  const { openItemId, builtIn, custom, links, repeat, reminder, ticket } =
    useItemEditorStore.getState();
  const typed =
    Object.keys(builtIn).length > 0 ||
    Object.keys(ticket).length > 0 ||
    Object.keys(custom).length > 0 ||
    links !== EMPTY_LINK_DRAFT ||
    repeat !== null ||
    reminder !== null;
  return openItemId !== null && typed;
};

/** Keeps the editor open for an item while a move navigates to the item's new area. */
export const carryItemEditor = (carried: CarriedEditor) => useItemEditorStore.setState({ carried });

/** The pending carry of the open editor, if a move is taking it to another area. */
export const carriedItemEditor = (): CarriedEditor | null => {
  const { openItemId, carried } = useItemEditorStore.getState();
  return carried !== null && carried.itemId === openItemId ? carried : null;
};

/** Marks a carried editor as arrived once the destination area shows its item. */
export const settleCarriedItemEditor = (areaKey: string) => {
  if (carriedItemEditor()?.areaKey === areaKey) {
    useItemEditorStore.setState({ carried: null });
  }
};

/** Closes the editor when its area closes, unless an item move is carrying it to another area. */
export const closeItemEditorWithArea = () => {
  if (carriedItemEditor() === null) {
    useItemEditorStore.getState().close();
  }
};

/**
 * Closes an editor carried to another area when a different area opens
 * first, as when the user navigates elsewhere before the move's area loads.
 */
export const dropStrayCarriedEditor = (areaKey: string) => {
  const carried = carriedItemEditor();
  if (carried !== null && carried.areaKey !== areaKey) {
    useItemEditorStore.getState().close();
  }
};
