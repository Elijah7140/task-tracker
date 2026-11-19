import type { ReminderPanel } from "@task-tracker/contracts";
import { create } from "zustand";

/** The latest reminders panel from the server, and whether the panel is shown. */
export interface ReminderPanelState {
  readonly open: boolean;
  /** The latest panel, or null before the first one arrives. */
  readonly panel: typeof ReminderPanel.Type | null;
  /** Why the panel could not be read, cleared when a panel arrives. */
  readonly failure: string | null;
  readonly setOpen: (open: boolean) => void;
  readonly receive: (panel: typeof ReminderPanel.Type) => void;
  readonly fail: (message: string) => void;
}

/** A closed panel with no reminders yet, also used to reset tests. */
export const initialReminderPanelState = { open: false, panel: null, failure: null } as const;

/** The shell's reminders panel state (§7.12). */
export const useReminderPanelStore = create<ReminderPanelState>()((set) => ({
  ...initialReminderPanelState,
  setOpen: (open) => set({ open }),
  receive: (panel) => set({ panel, failure: null }),
  fail: (failure) => set({ failure }),
}));

/** True while the reminders panel is shown. */
export const isReminderPanelOpen = () => useReminderPanelStore.getState().open;
