import { create } from "zustand";
import type { AddKind } from "./add-item-draft.js";

/** An open add dialog: which kind, under which parent, and whether it shows every field. */
export interface AddItemRequest {
  /** Distinguishes requests, so a new one starts with a blank form. */
  readonly id: number;
  readonly kind: AddKind;
  readonly parentItemId: string | null;
  /** Whether every field shows. Null follows the App Settings choice for the kind (§7.19). */
  readonly detailed: boolean | null;
}

/** The workspace's add dialog (§7.19). One is open at a time, in the open area. */
export interface AddItemState {
  readonly request: AddItemRequest | null;
  readonly open: (request: Omit<AddItemRequest, "id">) => void;
  /** Shows quick add or the detailed add view, keeping the draft. */
  readonly setDetailed: (detailed: boolean) => void;
  readonly close: () => void;
}

let nextRequestId = 1;

/** The add dialog's session state. Closing it forgets the draft. */
export const useAddItemStore = create<AddItemState>()((set) => ({
  request: null,
  open: (request) => set({ request: { ...request, id: nextRequestId++ } }),
  setDetailed: (detailed) =>
    set((state) => (state.request === null ? state : { request: { ...state.request, detailed } })),
  close: () => set({ request: null }),
}));
