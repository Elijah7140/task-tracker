/** What closing the main window does (§7.12). */
export type TrayCloseAction = "close" | "hide-to-tray" | "minimize";

/** Why the window is closing: the user's close button, an app quit or the OS session ending. */
export type WindowCloseReason = "user" | "application" | "system";

/** The facts {@link decideTrayClose} needs when the main window is asked to close. */
export interface TrayCloseState {
  /** The `KeepRunningInTray` setting. */
  readonly keepRunningInTray: boolean;
  /** Whether a tray host is showing the app's icon. */
  readonly trayIconShown: boolean;
  /** Whether the window is already minimised. */
  readonly minimized: boolean;
  /** Whether the user chose Quit, from the tray menu or otherwise. */
  readonly quitting: boolean;
}

/**
 * Keeps running only for a user close with `KeepRunningInTray` on. Hides to the
 * tray only when a tray icon is really shown; otherwise minimises, so the window
 * is never unreachable. Closing a window that is already minimised (from the
 * taskbar) quits, so quitting stays possible.
 */
export function decideTrayClose(state: TrayCloseState, reason: WindowCloseReason): TrayCloseAction {
  if (!state.keepRunningInTray || state.quitting || reason !== "user") {
    return "close";
  }
  if (state.trayIconShown) {
    return "hide-to-tray";
  }
  return state.minimized ? "close" : "minimize";
}
