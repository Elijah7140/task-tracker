import { useWorkspaceStore } from "../state/workspace-store.js";
import { TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";

/** The element that has focus, unless focus is nowhere in particular. */
export function focusedElement(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/** Whether `element` is still on screen and can take focus. */
export function canTakeFocus(element: HTMLElement | null): element is HTMLElement {
  return (
    element !== null &&
    element.isConnected &&
    element.checkVisibility() &&
    !element.matches(":disabled")
  );
}

function selectedItemRow(): HTMLElement | null {
  const id = useWorkspaceStore.getState().selectedItemId;
  if (id === null) {
    return null;
  }
  const selector = `[data-testid="item-tree-item"][${TREE_NODE_ATTRIBUTE}="${id}"]`;
  return document.querySelector<HTMLElement>(selector);
}

/** Focuses the main pane itself, which takes focus only until it loses it again. */
function focusMainPane() {
  const main = document.querySelector<HTMLElement>("main");
  if (main === null) {
    return;
  }
  main.tabIndex = -1;
  main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
  main.focus();
}

/**
 * Focuses `previous` when it can still take focus, else the selected item row,
 * else the main pane, so focus never falls to the document body.
 */
export function focusReturnTarget(previous: HTMLElement | null) {
  const target = [previous, selectedItemRow()].find(canTakeFocus);
  if (target === undefined) {
    focusMainPane();
  } else {
    target.focus();
  }
}
