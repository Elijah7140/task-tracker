/** A key with the exact modifiers a shortcut needs. Ctrl also matches Cmd on macOS. */
export interface Shortcut {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/** The modifier and key fields every keyboard event has, from the DOM or from React. */
type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/**
 * Whether `event` is exactly `shortcut`: the same key, ignoring letter case,
 * and no modifier missing or extra.
 */
export function matchesShortcut(event: KeyEventLike, shortcut: Shortcut): boolean {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    (event.ctrlKey || event.metaKey) === (shortcut.ctrl ?? false) &&
    event.shiftKey === (shortcut.shift ?? false) &&
    event.altKey === (shortcut.alt ?? false)
  );
}

/** The first of `shortcuts` that `event` matches, or undefined. */
export function findShortcut<Name extends string>(
  event: KeyEventLike,
  shortcuts: Readonly<Record<Name, Shortcut>>,
): Name | undefined {
  return (Object.keys(shortcuts) as Name[]).find((name) => matchesShortcut(event, shortcuts[name]));
}

/** The Menu key or Shift+F10, which open the focused control's context menu (§8). */
export function isContextMenuKey(event: KeyEventLike): boolean {
  return (
    matchesShortcut(event, { key: "ContextMenu" }) ||
    matchesShortcut(event, { key: "F10", shift: true })
  );
}

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Whether `target` takes typed text, so a shortcut that leaves text boxes alone ignores it. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.closest("textarea, [role=textbox]") !== null) {
    return true;
  }
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}
