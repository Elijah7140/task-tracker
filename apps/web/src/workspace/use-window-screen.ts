import { useEffect, useState } from "react";

/** The window's width and the width a maximized window fills on its current screen. */
export interface WindowScreen {
  readonly windowWidth: number;
  readonly screenWidth: number;
}

function readWindowScreen(): WindowScreen {
  return { windowWidth: window.innerWidth, screenWidth: window.screen.availWidth };
}

const sameWindowScreen = (left: WindowScreen | null, right: WindowScreen) =>
  left !== null && left.windowWidth === right.windowWidth && left.screenWidth === right.screenWidth;

/**
 * Subscribes to the events that change the window or its screen: a resize, a screen change
 * where the browser reports one, and a pixel-ratio change, as when the window moves to a
 * screen with another scale. Returns the unsubscribe function.
 */
function watchWindowScreen(onChange: () => void) {
  const screen = window.screen as Screen & Partial<EventTarget>;
  const resolution = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
  window.addEventListener("resize", onChange);
  screen.addEventListener?.("change", onChange);
  resolution?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    screen.removeEventListener?.("change", onChange);
    resolution?.removeEventListener("change", onChange);
  };
}

/**
 * The window and screen widths while `enabled`, read again when the window resizes or moves
 * to another screen (§7.17). Returns null while disabled.
 */
export function useWindowScreen(enabled: boolean): WindowScreen | null {
  const [current, setCurrent] = useState<WindowScreen | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCurrent(null);
      return;
    }
    const update = () => {
      const next = readWindowScreen();
      setCurrent((previous) => (sameWindowScreen(previous, next) ? previous : next));
    };
    update();
    return watchWindowScreen(update);
  }, [enabled]);

  return current;
}
