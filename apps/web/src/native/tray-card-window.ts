/**
 * Asks Electron main to hide the tray card and show the in-progress stack in
 * its own window (§7.18). Outside Electron there is no tray card.
 */
export async function popOutTrayCard(): Promise<boolean> {
  const popOut = window.taskTrackerDesktop?.popOutTrayCard;
  if (popOut === undefined) {
    return false;
  }
  try {
    return await popOut();
  } catch {
    return false;
  }
}

/**
 * Asks Electron main to keep the popped-out in-progress window above other
 * windows, or to stop. Resolves with the state main applied, or false outside
 * Electron or when main refuses.
 */
export async function setInProgressWindowOnTop(onTop: boolean): Promise<boolean> {
  const apply = window.taskTrackerDesktop?.setInProgressWindowOnTop;
  if (apply === undefined) {
    return false;
  }
  try {
    return await apply(onTop);
  } catch {
    return false;
  }
}
