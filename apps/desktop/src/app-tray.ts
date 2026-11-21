import { Menu, nativeImage, Tray } from "electron";
import { isTrayHostAvailable } from "./tray-host-probe.js";

/** The notification-area icon that keeps the app reachable while its window is hidden. */
export interface AppTray {
  /** Whether a tray host is showing the icon now. */
  readonly shown: () => boolean;
  /** Shows the icon when enabled and a tray host exists, and removes it otherwise. */
  readonly setEnabled: (enabled: boolean) => Promise<void>;
  /** Removes the icon for good, as on quit. */
  readonly destroy: () => void;
}

/** What the tray icon and its menu do. */
export interface AppTrayOptions {
  readonly iconPath: string;
  readonly onOpen: () => void;
  /** Opens the multi-ticket add window (§7.20). */
  readonly onAddTickets: () => void;
  readonly onQuit: () => void;
  /** A left click on the icon, where the desktop reports one. Defaults to `onOpen`. */
  readonly onClick?: () => void;
}

function createTray({ iconPath, onOpen, onAddTickets, onQuit, onClick = onOpen }: AppTrayOptions) {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 }));
  tray.setToolTip("Task Tracker");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: onOpen },
      { label: "Add tickets…", click: onAddTickets },
      { label: "Quit", click: onQuit },
    ]),
  );
  // A left click shows the in-progress card (§7.18). The menu keeps Open and Quit
  // for desktops that only expose the menu, and adds several tickets at once (§7.20).
  tray.on("click", onClick);
  return tray;
}

/**
 * Keeps one tray icon in step with `KeepRunningInTray` (§7.12). The icon appears
 * only where a tray host will show it; the latest request wins when probes overlap.
 */
export function createAppTray(options: AppTrayOptions): AppTray {
  let tray: Tray | undefined;
  let request = 0;
  let destroyed = false;

  const remove = () => {
    tray?.destroy();
    tray = undefined;
  };

  const setEnabled = async (enabled: boolean) => {
    const current = ++request;
    const available = enabled && (await isTrayHostAvailable(process.platform));
    if (current !== request || destroyed) {
      return;
    }
    if (!available) {
      remove();
      return;
    }
    tray ??= createTray(options);
  };

  return {
    shown: () => tray !== undefined,
    setEnabled,
    destroy: () => {
      destroyed = true;
      remove();
    },
  };
}
