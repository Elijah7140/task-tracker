import { useEffect, useState } from "react";
import { setInProgressWindowOnTop } from "../native/tray-card-window.js";

const STORAGE_KEY = "task-tracker.in-progress-on-top";

function readStoredOnTop(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeOnTop(onTop: boolean) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(onTop));
  } catch {
    // Storage can be unavailable. The choice then lasts while the window is open.
  }
}

/** Whether the popped-out window stays above other windows, and its toggle. */
export interface KeepOnTop {
  readonly onTop: boolean;
  readonly toggle: () => void;
}

/**
 * The popped-out in-progress window's Keep on top toggle (§7.18). The choice is
 * remembered across launches in local storage and applied by Electron main when
 * the window opens and on each toggle. The button shows the state main applied.
 */
export function useKeepOnTop(): KeepOnTop {
  const [onTop, setOnTop] = useState(false);

  useEffect(() => {
    let current = true;
    void setInProgressWindowOnTop(readStoredOnTop()).then((applied) => {
      if (current) {
        setOnTop(applied);
      }
    });
    return () => {
      current = false;
    };
  }, []);

  const toggle = () => {
    const wanted = !onTop;
    storeOnTop(wanted);
    void setInProgressWindowOnTop(wanted).then(setOnTop);
  };

  return { onTop, toggle };
}
