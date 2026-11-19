import { type RefObject, useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { isItemEditorOpen } from "../state/item-editor-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { findItemNode, type ItemNode, type ItemSiblings } from "./item-outline.js";

/** Options for {@link useWorkspaceShortcuts}. */
export interface WorkspaceShortcutOptions {
  readonly quickAddRef: RefObject<HTMLInputElement | null>;
  /** The area's current item snapshot. */
  readonly items: ItemSiblings;
  readonly addSubItem: (parent: ItemNode) => Promise<void>;
  /** Opens Move to… for the selected top-level item. */
  readonly moveItemToArea: (node: ItemNode) => Promise<void>;
}

/** Whether the key is Ctrl+N or Ctrl+Shift+N (Cmd on macOS) with no dialog or editor open. */
function isNewItemShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "n") {
    return false;
  }
  return dialogStore.getState().queue.length === 0 && !isItemEditorOpen();
}

/** Ctrl+Shift+L (Cmd on macOS) with no dialog open. It also runs from the item editor (§7.5). */
function isMoveToAreaShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || !event.shiftKey || !(event.ctrlKey || event.metaKey)) {
    return false;
  }
  return event.key.toLowerCase() === "l" && dialogStore.getState().queue.length === 0;
}

function selectedNode(items: ItemSiblings): ItemNode | undefined {
  const selectedId = useWorkspaceStore.getState().selectedItemId;
  return selectedId === null ? undefined : findItemNode(items, selectedId);
}

/**
 * Window-wide workspace keys (§8): Ctrl+N focuses quick-add, Ctrl+Shift+N
 * adds a sub-item under the selected item and Ctrl+Shift+L moves the selected
 * top-level item to another area.
 */
export function useWorkspaceShortcuts(options: WorkspaceShortcutOptions) {
  const latestRef = useRef(options);
  latestRef.current = options;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isMoveToAreaShortcut(event)) {
        const selected = selectedNode(latestRef.current.items);
        if (selected?.item.parentItemId === null) {
          event.preventDefault();
          void latestRef.current.moveItemToArea(selected);
        }
        return;
      }
      if (!isNewItemShortcut(event)) {
        return;
      }
      const { quickAddRef, items, addSubItem } = latestRef.current;
      if (!event.shiftKey) {
        event.preventDefault();
        quickAddRef.current?.focus();
        return;
      }
      const selected = selectedNode(items);
      if (selected !== undefined) {
        event.preventDefault();
        void addSubItem(selected);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
