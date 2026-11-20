import { canTakeFocus, focusedElement } from "./focus-return-target.js";

/** Marks the menu bar. Its menus' popups carry {@link MENU_BAR_POPUP_ATTRIBUTE}. */
export const MENU_BAR_ATTRIBUTE = "data-menu-bar";

/** Marks a popup opened from the menu bar, which renders outside the bar itself. */
export const MENU_BAR_POPUP_ATTRIBUTE = "data-menu-bar-popup";

let focusBeforeMenuBar: HTMLElement | null = null;

/** Whether `element` is in the menu bar or one of its open menus. */
export function isInMenuBar(element: Element | null): boolean {
  return element?.closest(`[${MENU_BAR_ATTRIBUTE}], [${MENU_BAR_POPUP_ATTRIBUTE}]`) != null;
}

/**
 * Records what had focus before the menu bar took it, ignoring moves within
 * the bar and its menus, so leaving the bar can return there.
 */
export function rememberFocusBeforeMenuBar(element: Element | null) {
  if (isInMenuBar(element)) {
    return;
  }
  focusBeforeMenuBar = element instanceof HTMLElement && element !== document.body ? element : null;
}

/**
 * Follows focus outside the menu bar from the moment it is called, so the bar
 * knows where to return focus, even when a menu's command unmounts the
 * element focus came from. Returns the function that stops following.
 */
export function trackFocusOutsideMenuBar() {
  const focusIn = (event: FocusEvent) => rememberFocusBeforeMenuBar(event.target as Element | null);
  const focusOut = (event: FocusEvent) => {
    // Focus left for nowhere, such as a click on the page background.
    if (event.relatedTarget === null && !isInMenuBar(event.target as Element | null)) {
      focusBeforeMenuBar = null;
    }
  };
  document.addEventListener("focusin", focusIn);
  document.addEventListener("focusout", focusOut);
  return () => {
    document.removeEventListener("focusin", focusIn);
    document.removeEventListener("focusout", focusOut);
  };
}

/**
 * The element a page should treat as focused: what had focus before the menu
 * bar while the bar or one of its menus holds focus, else the focused element.
 */
export function focusedOutsideMenuBar(): HTMLElement | null {
  const active = focusedElement();
  return isInMenuBar(active) ? focusBeforeMenuBar : active;
}

/**
 * Where focus goes once a chosen menu command closes its menu. A command that
 * moved focus itself, such as opening Search, keeps it there. Otherwise focus
 * returns to where it was before the menu bar, or stays on the menu's trigger.
 */
export function focusAfterMenuCommand(): HTMLElement | boolean {
  const active = focusedElement();
  if (active !== null && !isInMenuBar(active)) {
    return false;
  }
  return canTakeFocus(focusBeforeMenuBar) ? focusBeforeMenuBar : true;
}

/** The element focused before the menu bar, if it can still take focus. */
export function focusBeforeMenuBarTarget(): HTMLElement | null {
  return canTakeFocus(focusBeforeMenuBar) ? focusBeforeMenuBar : null;
}
