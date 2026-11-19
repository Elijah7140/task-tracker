import type { KeyboardEvent } from "react";

/** Data attribute that carries a tree item's ID for {@link handleTreeKeyDown}. */
export const TREE_NODE_ATTRIBUTE = "data-node-id";

/** Callbacks a tree supplies to {@link handleTreeKeyDown}. */
export interface TreeKeyboardHandlers {
  /** Expands or collapses the item. */
  readonly onExpandedChange: (id: string, expanded: boolean) => void;
  /** Handles other keys on a focused item, such as Enter or F2. Returns true when handled. */
  readonly onItemKey?: ((id: string, event: KeyboardEvent<HTMLElement>) => boolean) | undefined;
}

function treeItems(tree: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'));
}

function focusSibling(tree: HTMLElement, current: HTMLElement, offset: number) {
  const items = treeItems(tree);
  const index = items.indexOf(current);
  items[Math.min(Math.max(index + offset, 0), items.length - 1)]?.focus();
}

function focusEdge(tree: HTMLElement, edge: "first" | "last") {
  const items = treeItems(tree);
  (edge === "first" ? items[0] : items.at(-1))?.focus();
}

interface KeyContext {
  readonly tree: HTMLElement;
  readonly item: HTMLElement;
  readonly id: string;
  readonly handlers: TreeKeyboardHandlers;
}

function moveRight({ tree, item, id, handlers }: KeyContext) {
  const expanded = item.getAttribute("aria-expanded");
  if (expanded === "false") {
    handlers.onExpandedChange(id, true);
  } else if (expanded === "true") {
    focusSibling(tree, item, 1);
  }
}

function moveLeft({ item, id, handlers }: KeyContext) {
  if (item.getAttribute("aria-expanded") === "true") {
    handlers.onExpandedChange(id, false);
    return;
  }
  item.parentElement?.closest<HTMLElement>('[role="treeitem"]')?.focus();
}

const navigationKeys: Readonly<Record<string, (context: KeyContext) => void>> = {
  ArrowDown: ({ tree, item }) => focusSibling(tree, item, 1),
  ArrowUp: ({ tree, item }) => focusSibling(tree, item, -1),
  Home: ({ tree }) => focusEdge(tree, "first"),
  End: ({ tree }) => focusEdge(tree, "last"),
  ArrowRight: moveRight,
  ArrowLeft: moveLeft,
};

function navigate(key: string, context: KeyContext): boolean {
  const action = navigationKeys[key];
  if (action === undefined) {
    return false;
  }
  action(context);
  return true;
}

/**
 * Keyboard support for a `role="tree"` element, following the WAI-ARIA tree
 * pattern: arrows move between visible items, Right and Left expand, collapse
 * or move to the parent, and Home and End jump to the ends. Attach it to the
 * tree's `onKeyDown`. Items need `role="treeitem"`, `aria-expanded` when they
 * have children and {@link TREE_NODE_ATTRIBUTE}. Modified keys go only to
 * `onItemKey`, and keys pressed on controls inside an item are left alone.
 */
export function handleTreeKeyDown(
  event: KeyboardEvent<HTMLElement>,
  handlers: TreeKeyboardHandlers,
) {
  const item = event.target;
  if (!(item instanceof HTMLElement) || item.getAttribute("role") !== "treeitem") {
    return;
  }
  const id = item.getAttribute(TREE_NODE_ATTRIBUTE);
  if (id === null) {
    return;
  }
  const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  const context = { tree: event.currentTarget, item, id, handlers };
  const handled =
    (!modified && navigate(event.key, context)) || handlers.onItemKey?.(id, event) === true;
  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}
