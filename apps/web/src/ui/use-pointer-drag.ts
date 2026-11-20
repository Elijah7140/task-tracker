import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";

/** Callbacks for one pointer drag gesture. */
export interface PointerDragHandlers {
  /** The pointer moved after crossing the drag threshold. */
  readonly move: (event: MouseEvent) => void;
  /** The left button was released after the drag started. */
  readonly drop: (event: MouseEvent) => void;
  /** The gesture ended for any reason, including a plain click or cancellation. */
  readonly end: () => void;
  /**
   * Lets the press focus its element, as a row press must (§7.5). Otherwise
   * the press is prevented so focus stays put, as for reorder handles.
   */
  readonly focusOnPress?: boolean | undefined;
}

/** Stops text selection and native drag-and-drop while a pointer drag is underway. */
const preventDefault = (event: Event) => event.preventDefault();

function suppressDragClick() {
  const clear = () => {
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("pointerdown", clear, true);
  };
  const onClick = (event: MouseEvent) => {
    if (event.detail > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clear();
    }
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("pointerdown", clear, true);
  return clear;
}

/** Share threshold, capture, button handling, and cancellation across pointer drags. */
export function usePointerDrag() {
  const running = useRef<(() => void) | null>(null);
  const clearClick = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      running.current?.();
      clearClick.current?.();
    },
    [],
  );

  return (press: ReactPointerEvent<HTMLElement>, handlers: PointerDragHandlers) => {
    if (press.button !== 0 || !press.isPrimary || running.current !== null) {
      return;
    }
    if (handlers.focusOnPress !== true) {
      press.preventDefault();
    }
    const { currentTarget: element, pointerId, clientX, clientY, pointerType } = press;
    let dragging = false;
    // Chromium may drop capture when a second mouse button goes down: on Windows at the press,
    // elsewhere when it handles the context menu. The left gesture stays alive either way.
    let secondaryButtonMayReleaseCapture = false;

    const end = () => {
      running.current = null;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("lostpointercapture", lostCapture, true);
      window.removeEventListener("mousedown", chordDown, true);
      window.removeEventListener("mouseup", chordUp, true);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("contextmenu", contextMenu, true);
      window.removeEventListener("selectstart", preventDefault, true);
      window.removeEventListener("dragstart", preventDefault, true);
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      handlers.end();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      if ((event.buttons & 1) === 0 || (dragging && !element.hasPointerCapture(pointerId))) {
        end();
        return;
      }
      // A press or release of another button arrives as a chorded move with that button.
      secondaryButtonMayReleaseCapture = dragging && event.button > 0;
      if (event.button > 0) {
        return;
      }
      if (!dragging) {
        if (Math.hypot(event.clientX - clientX, event.clientY - clientY) < 4) {
          return;
        }
        element.setPointerCapture(pointerId);
        window.getSelection()?.removeAllRanges();
        clearClick.current = suppressDragClick();
        dragging = true;
      }
      handlers.move(event);
    };
    const complete = (event: MouseEvent) => {
      const shouldDrop = dragging && element.hasPointerCapture(pointerId);
      end();
      if (shouldDrop) {
        handlers.drop(event);
      }
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointerId && event.button === 0) {
        complete(event);
      }
    };
    // A secondary press during a left drag must not focus another control or open a menu.
    const chordDown = (event: MouseEvent) => {
      if (pointerType === "mouse" && event.button !== 0) {
        secondaryButtonMayReleaseCapture = dragging;
        event.preventDefault();
      }
    };
    // Mouse pointerup only fires after the final button is released.
    const chordUp = (event: MouseEvent) => {
      if (pointerType === "mouse" && event.button === 0) {
        complete(event);
      }
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) {
        end();
      }
    };
    const lostCapture = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      // Capture lost to a secondary button, even a prevented context menu, is taken back.
      if (secondaryButtonMayReleaseCapture && (event.buttons & 1) !== 0) {
        secondaryButtonMayReleaseCapture = false;
        element.setPointerCapture(pointerId);
        if (element.hasPointerCapture(pointerId)) {
          return;
        }
      }
      end();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dragging) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        end();
      }
    };
    const contextMenu = (event: MouseEvent) => {
      secondaryButtonMayReleaseCapture = dragging && pointerType === "mouse" && event.button === 2;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    running.current = end;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("lostpointercapture", lostCapture, true);
    window.addEventListener("mousedown", chordDown, true);
    window.addEventListener("mouseup", chordUp, true);
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("contextmenu", contextMenu, true);
    window.addEventListener("selectstart", preventDefault, true);
    window.addEventListener("dragstart", preventDefault, true);
  };
}
