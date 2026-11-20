import { type RefObject, useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { isItemEditorOpen, useItemEditorStore } from "../state/item-editor-store.js";
import { isPageCovered } from "../state/return-page-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { findShortcut, isTextEntryTarget } from "../ui/keyboard-shortcut.js";
import { findItemNode, type ItemNode, type ItemSiblings } from "./item-outline.js";
import { itemPushBackState, PUSH_BACK_SHORTCUT, pushBackReason } from "./push-back-availability.js";

/** Options for {@link useWorkspaceShortcuts}. */
export interface WorkspaceShortcutOptions {
  readonly quickAddRef: RefObject<HTMLInputElement | null>;
  /** The area's current item snapshot. */
  readonly items: ItemSiblings;
  readonly addSubItem: (parent: ItemNode) => Promise<void>;
  /** Opens Move to… for the selected top-level item. */
  readonly moveItemToArea: (node: ItemNode) => Promise<void>;
  /** Pushes back the selected item, or the item open in the editor (§7.14). */
  readonly pushBack: (node: ItemNode) => Promise<void>;
}

const WORKSPACE_SHORTCUTS = {
  focusQuickAdd: { key: "n", ctrl: true },
  addSubItem: { key: "n", ctrl: true, shift: true },
  moveToArea: { key: "l", ctrl: true, shift: true },
  pushBack: PUSH_BACK_SHORTCUT,
} as const;

type WorkspaceShortcut = keyof typeof WORKSPACE_SHORTCUTS;

/**
 * The workspace shortcut the key presses, if the workspace is shown and no
 * dialog is open. Ctrl+Shift+L (§7.5) and Ctrl+Shift+P (§7.14) also run from
 * the item editor, and Ctrl+Shift+P leaves text boxes alone.
 */
function workspaceShortcut(event: KeyboardEvent): WorkspaceShortcut | undefined {
  const shortcut = findShortcut(event, WORKSPACE_SHORTCUTS);
  if (shortcut === undefined || dialogStore.getState().queue.length > 0 || isPageCovered()) {
    return undefined;
  }
  if (shortcut === "pushBack") {
    return isTextEntryTarget(event.target) ? undefined : shortcut;
  }
  return shortcut === "moveToArea" || !isItemEditorOpen() ? shortcut : undefined;
}

function selectedNode(items: ItemSiblings): ItemNode | undefined {
  const selectedId = useWorkspaceStore.getState().selectedItemId;
  return selectedId === null ? undefined : findItemNode(items, selectedId);
}

/** The item open in the editor, else the selected row. */
function pushBackTarget(items: ItemSiblings): ItemNode | undefined {
  const openItemId = useItemEditorStore.getState().openItemId;
  return openItemId === null ? selectedNode(items) : findItemNode(items, openItemId);
}

/** Pushes back the target unless the row menu would show the action disabled. */
function runPushBack(event: KeyboardEvent, options: WorkspaceShortcutOptions): boolean {
  const selected = pushBackTarget(options.items);
  if (selected === undefined || pushBackReason(itemPushBackState(selected.item)) !== null) {
    return false;
  }
  if (!event.repeat) {
    void options.pushBack(selected);
  }
  return true;
}

/** Runs a shortcut, ignoring a held key's repeats. Returns whether the key was used. */
function runShortcut(
  shortcut: WorkspaceShortcut,
  event: KeyboardEvent,
  options: WorkspaceShortcutOptions,
): boolean {
  if (shortcut === "focusQuickAdd") {
    if (!event.repeat) {
      options.quickAddRef.current?.focus();
    }
    return true;
  }
  if (shortcut === "pushBack") {
    return runPushBack(event, options);
  }
  const selected = selectedNode(options.items);
  if (
    selected === undefined ||
    (shortcut === "moveToArea" && selected.item.parentItemId !== null)
  ) {
    return false;
  }
  if (!event.repeat) {
    void (shortcut === "addSubItem" ? options.addSubItem : options.moveItemToArea)(selected);
  }
  return true;
}

/**
 * Window-wide workspace keys (§8): Ctrl+N focuses quick-add, Ctrl+Shift+N
 * adds a sub-item under the selected item, Ctrl+Shift+L moves the selected
 * top-level item to another area and Ctrl+Shift+P pushes back the selected item. None of them acts while a covering page
 * hides the workspace, and a held key runs its shortcut once.
 */
export function useWorkspaceShortcuts(options: WorkspaceShortcutOptions) {
  const latestRef = useRef(options);
  latestRef.current = options;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = workspaceShortcut(event);
      if (shortcut !== undefined && runShortcut(shortcut, event, latestRef.current)) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
