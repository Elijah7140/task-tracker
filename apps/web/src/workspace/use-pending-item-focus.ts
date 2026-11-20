import { type RefObject, useEffect, useState } from "react";
import { TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";
import { findItemNode, type ItemFocusRequest, type ItemSiblings } from "./item-outline.js";

/** Options for {@link usePendingItemFocus}. */
export interface PendingItemFocusOptions {
  /** Holds the area's item tree or empty state. */
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly quickAddRef: RefObject<HTMLInputElement | null>;
  /** The area's current item snapshot. */
  readonly nodes: ItemSiblings;
}

function isFocusReady(nodes: ItemSiblings, request: ItemFocusRequest): boolean {
  if (
    request.expectedParentId !== undefined &&
    findItemNode(nodes, request.id)?.item.parentItemId !== request.expectedParentId
  ) {
    return false;
  }
  return request.afterNodes === undefined || nodes !== request.afterNodes;
}

function rowElement(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[${TREE_NODE_ATTRIBUTE}="${id}"]`);
}

/** Whether focus is still where the action left it, not in another pane or dialog. */
function focusIsUnclaimed(container: HTMLElement): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || container.contains(active);
}

/** The row to focus after the requested item may have left the open list. */
function departureTarget(
  container: HTMLElement,
  nodes: ItemSiblings,
  request: ItemFocusRequest,
  fallbackIds: ReadonlyArray<string>,
): HTMLElement | null {
  const node = findItemNode(nodes, request.id);
  const stillOpen = node !== undefined && !node.isFinished;
  const candidates = stillOpen ? [request.id, ...fallbackIds] : fallbackIds;
  for (const id of candidates) {
    const row = rowElement(container, id);
    if (row !== null) {
      return row;
    }
  }
  return null;
}

/** Moves focus for a ready request. Returns false while the requested row is not rendered yet. */
function applyFocus(
  container: HTMLElement,
  quickAdd: HTMLInputElement | null,
  nodes: ItemSiblings,
  request: ItemFocusRequest,
): boolean {
  const { fallbackIds } = request;
  if (fallbackIds === undefined) {
    const row = rowElement(container, request.id);
    row?.focus();
    return row !== null;
  }
  if (focusIsUnclaimed(container)) {
    (departureTarget(container, nodes, request, fallbackIds) ?? quickAdd)?.focus();
  }
  return true;
}

/**
 * Applies item focus requests once the snapshot they wait for has rendered.
 * When an item leaves the open list, focus moves to a neighbouring row, the
 * parent or quick-add so it never falls to the page body. Returns the
 * function that issues a request.
 */
export function usePendingItemFocus({ containerRef, quickAddRef, nodes }: PendingItemFocusOptions) {
  const [request, setRequest] = useState<ItemFocusRequest | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (request === null || container === null || !isFocusReady(nodes, request)) {
      return;
    }
    if (applyFocus(container, quickAddRef.current, nodes, request)) {
      setRequest(null);
    }
  }, [request, nodes, containerRef, quickAddRef]);

  return setRequest;
}
