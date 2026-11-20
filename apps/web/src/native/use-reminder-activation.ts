import { ReminderActivation } from "@task-tracker/contracts";
import { Option, Schema } from "effect";
import { useEffect, useRef } from "react";

const decodeActivation = Schema.decodeUnknownOption(ReminderActivation);

/** What a clicked notification opens. */
export interface ReminderActivationHandlers {
  /** Opens the item a single reminder named. */
  readonly openItem: (itemId: string) => void;
  /** Opens the reminders panel, as for a grouped notification. */
  readonly openPanel: () => void;
}

/**
 * Opens the item or the panel when a native reminder notification is clicked
 * (§7.12). Electron main brings the window forward first. Activations that do
 * not decode are ignored. Outside Electron there are no notifications.
 */
export function useReminderActivation(handlers: ReminderActivationHandlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const bridge = window.taskTrackerDesktop;
    if (bridge?.onReminderActivated === undefined) {
      return;
    }
    return bridge.onReminderActivated((value) => {
      Option.map(decodeActivation(value), ({ itemId }) => {
        if (itemId === null) {
          latest.current.openPanel();
        } else {
          latest.current.openItem(itemId);
        }
      });
    });
  }, []);
}
