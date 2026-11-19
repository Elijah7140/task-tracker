import { useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";

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

function isViewShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey;
}

function hasModifier(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
}

function commandFor(event: KeyboardEvent, commands: CalendarKeyCommands) {
  if (isViewShortcut(event)) {
    const key = event.key.toLowerCase();
    return key === "m" ? commands.showMonth : key === "w" ? commands.showWeek : undefined;
  }
  if (hasModifier(event) || isEditableTarget(event.target)) {
    return undefined;
  }
  return event.key === "PageUp"
    ? commands.previous
    : event.key === "PageDown"
      ? commands.next
      : undefined;
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
