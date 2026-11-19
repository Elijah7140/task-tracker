/**
 * Opens a context menu trigger's menu from the keyboard, as the Menu key and
 * Shift+F10 do natively, by sending it a context menu event at its lower left
 * corner so the menu appears below the control.
 */
export function openContextMenuAt(trigger: HTMLElement) {
  const { left, bottom } = trigger.getBoundingClientRect();
  trigger.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: left,
      clientY: bottom,
    }),
  );
}
