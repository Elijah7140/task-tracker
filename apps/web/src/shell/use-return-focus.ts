import { useCallback, useEffect, useRef } from "react";
import { useReturnPageStore } from "../state/return-page-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";

/** The element that had focus, unless focus was nowhere in particular. */
function focusedElement(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function canTakeFocus(element: HTMLElement | null): element is HTMLElement {
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

/** The element that had focus before, else the selected item row, else the main pane. */
function focusReturnTarget(previous: HTMLElement | null) {
  const target = [previous, selectedItemRow()].find(canTakeFocus);
  if (target === undefined) {
    focusMainPane();
  } else {
    target.focus();
  }
}

/**
 * Remembers what had focus when a covering page opened over the routed page,
 * and returns there after Back or Escape so focus never falls to the document
 * body. Switching between covering pages keeps the first target. Call the
 * returned function just before hiding the covering page.
 */
export function useReturnFocus() {
  const previous = useRef<HTMLElement | null>(null);
  const restorePending = useRef(false);
  const covering = useReturnPageStore((state) => state.covering);

  useEffect(
    () =>
      useReturnPageStore.subscribe((state, prior) => {
        if (prior.covering === null && state.covering !== null) {
          previous.current = focusedElement();
        }
      }),
    [],
  );

  useEffect(() => {
    if (covering !== null) {
      return;
    }
    if (restorePending.current) {
      focusReturnTarget(previous.current);
    }
    restorePending.current = false;
    previous.current = null;
  }, [covering]);

  return useCallback(() => {
    restorePending.current = true;
  }, []);
}
