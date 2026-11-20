import { useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { findShortcut } from "../ui/keyboard-shortcut.js";

/** Period and view commands that Calendar binds to keys. */
export interface CalendarKeyCommands {
  readonly previous: () => void;
  readonly next: () => void;
  readonly showMonth: () => void;
  readonly showWeek: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

const CALENDAR_SHORTCUTS = {
  showMonth: { key: "m", ctrl: true, shift: true },
  showWeek: { key: "w", ctrl: true, shift: true },
  previous: { key: "PageUp" },
  next: { key: "PageDown" },
} as const;

function commandFor(event: KeyboardEvent, commands: CalendarKeyCommands) {
  const shortcut = findShortcut(event, CALENDAR_SHORTCUTS);
  if (shortcut === undefined) {
    return undefined;
  }
  const changesPeriod = shortcut === "previous" || shortcut === "next";
  return changesPeriod && isEditableTarget(event.target) ? undefined : commands[shortcut];
}

/**
 * Binds Calendar's keys while it is shown (§7.4): PageUp and PageDown change
 * the period, also with an entry focused but not in a text box, and
 * Ctrl+Shift+M and Ctrl+Shift+W switch views. Keys with other modifiers and
 * keys while a dialog is open do nothing.
 */
export function useCalendarKeys(commands: CalendarKeyCommands) {
  const latest = useRef(commands);
  latest.current = commands;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || dialogStore.getState().queue.length > 0) {
        return;
      }
      const command = commandFor(event, latest.current);
      if (command !== undefined) {
        event.preventDefault();
        command();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
