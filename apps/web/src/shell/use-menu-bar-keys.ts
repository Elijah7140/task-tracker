import { type RefObject, useEffect } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { isItemEditorOpen } from "../state/item-editor-store.js";
import { isPageCovered } from "../state/return-page-store.js";
import { matchesShortcut } from "../ui/keyboard-shortcut.js";
import { focusReturnTarget } from "./focus-return-target.js";
import {
  focusBeforeMenuBarTarget,
  isInMenuBar,
  rememberFocusBeforeMenuBar,
} from "./menu-bar-focus.js";

const TRIGGER_SELECTOR = "[data-access-key]";

/** Whether the menu bar can take keyboard focus: no message box or item editor is over it. */
function isAvailable(menuBar: HTMLElement) {
  const editorShown = isItemEditorOpen() && !isPageCovered();
  return (
    menuBar.isConnected &&
    menuBar.closest("[inert], [aria-hidden=true]") === null &&
    dialogStore.getState().queue.length === 0 &&
    !editorShown
  );
}

function enabledTriggers(menuBar: HTMLElement) {
  return [...menuBar.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR)].filter(
    (trigger) => !trigger.hasAttribute("data-disabled"),
  );
}

/** Leaves the menu bar for what had focus before it, closing any open menu. */
export function leaveMenuBar() {
  focusReturnTarget(focusBeforeMenuBarTarget());
}

function enterMenuBar(menuBar: HTMLElement) {
  rememberFocusBeforeMenuBar(document.activeElement);
  enabledTriggers(menuBar)[0]?.focus();
}

/** Alt alone and F10 move focus into the menu bar, or back out of it (legacy Avalonia menus). */
function toggleMenuBar(menuBar: HTMLElement) {
  if (isInMenuBar(document.activeElement)) {
    leaveMenuBar();
  } else {
    enterMenuBar(menuBar);
  }
}

/** Opens a menu with its first command highlighted, as ArrowDown on its name does. */
function openMenu(trigger: HTMLElement) {
  rememberFocusBeforeMenuBar(document.activeElement);
  trigger.focus();
  trigger.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
  );
}

/** The enabled menu whose access key `event` presses with Alt, such as Alt+F for File. */
function accessKeyTrigger(menuBar: HTMLElement, event: KeyboardEvent) {
  return enabledTriggers(menuBar).find((trigger) =>
    matchesShortcut(event, { key: trigger.dataset["accessKey"] ?? "", alt: true }),
  );
}

/**
 * Keyboard access to the menu bar from anywhere in the window: Alt pressed
 * and released alone or F10 focuses the first menu, and pressing either again
 * returns focus. Alt with a menu's access key opens that menu. The keys do
 * nothing while a message box or the item editor is open.
 */
export function useMenuBarKeys(menuBarRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let altAlone = false;
    const available = () => {
      const menuBar = menuBarRef.current;
      return menuBar !== null && isAvailable(menuBar) ? menuBar : null;
    };
    const keydown = (event: KeyboardEvent) => {
      altAlone =
        event.key === "Alt" && !event.repeat && matchesShortcut(event, { key: "Alt", alt: true });
      const menuBar = event.defaultPrevented || event.isComposing ? null : available();
      if (menuBar === null || altAlone) {
        return;
      }
      if (matchesShortcut(event, { key: "F10" })) {
        event.preventDefault();
        toggleMenuBar(menuBar);
        return;
      }
      const trigger = accessKeyTrigger(menuBar, event);
      if (trigger !== undefined) {
        event.preventDefault();
        openMenu(trigger);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      const pressedAlone = altAlone && event.key === "Alt";
      altAlone = false;
      const menuBar = pressedAlone ? available() : null;
      if (menuBar !== null) {
        event.preventDefault();
        toggleMenuBar(menuBar);
      }
    };
    const cancel = () => {
      altAlone = false;
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("pointerdown", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [menuBarRef]);
}
