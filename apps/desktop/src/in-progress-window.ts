import { BrowserWindow } from "electron";

/** What the popped-out in-progress window loads and how. */
export interface InProgressWindowOptions {
  /** The renderer page with the in-progress hash. Navigation anywhere else is refused. */
  readonly url: string;
  /** The app window's narrow preload, shared by the window. */
  readonly preload: string;
  readonly devTools: boolean;
}

/**
 * The tray card's stack popped out into an ordinary window (§7.18). Unlike the
 * card it stays open when it loses focus, and it can keep above other windows.
 * Its cards fill as many columns as its width fits.
 */
export interface InProgressWindow {
  /** Opens the window, or brings it forward when it is already open. */
  readonly show: () => void;
  /** Whether IPC came from the window's page, for handlers only it may call. */
  readonly isSender: (contents: Electron.WebContents) => boolean;
  /**
   * Keeps the window above other windows or stops doing so. The value crosses
   * IPC from a renderer, so anything but a boolean is refused. Returns the
   * state the window has afterwards.
   */
  readonly setAlwaysOnTop: (requested: unknown) => boolean;
  /** Closes the window for good, as when its server connection ends or the app quits. */
  readonly destroy: () => void;
}

/**
 * Opens the window with the same isolation as the app window: context
 * isolation, the sandbox, no Node integration, the same preload and session
 * permissions, no pop-ups and no navigation away from its page.
 */
function openWindow({ url, preload, devTools }: InProgressWindowOptions) {
  const window = new BrowserWindow({
    title: "In progress",
    width: 840,
    height: 640,
    minWidth: 340,
    minHeight: 160,
    show: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, target) => {
    if (target !== url) {
      event.preventDefault();
    }
  });
  return window;
}

/** Creates the pop-out controller. The window itself opens on the first Pop out. */
export function createInProgressWindow(options: InProgressWindowOptions): InProgressWindow {
  let current: BrowserWindow | undefined;

  const live = () => (current !== undefined && !current.isDestroyed() ? current : undefined);

  const destroy = () => {
    const window = live();
    current = undefined;
    window?.destroy();
  };

  const reveal = (window: BrowserWindow) => {
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  };

  const create = () => {
    const window = openWindow(options);
    current = window;
    window.once("ready-to-show", () => reveal(window));
    window.webContents.on("render-process-gone", destroy);
    window.once("closed", () => {
      if (current === window) {
        current = undefined;
      }
    });
    void window.loadURL(options.url).catch(() => undefined);
  };

  return {
    show: () => {
      const window = live();
      if (window === undefined) {
        create();
      } else {
        reveal(window);
      }
    },
    isSender: (contents) => live()?.webContents === contents,
    setAlwaysOnTop: (requested) => {
      const window = live();
      if (window === undefined) {
        return false;
      }
      if (typeof requested === "boolean") {
        window.setAlwaysOnTop(requested);
      }
      return window.isAlwaysOnTop();
    },
    destroy,
  };
}
