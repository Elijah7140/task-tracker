import { BrowserWindow, dialog } from "electron";

/** What the multi-ticket add window loads and how. */
export interface TicketBatchWindowOptions {
  /** The renderer page with the add-tickets hash. Navigation anywhere else is refused. */
  readonly url: string;
  /** The app window's narrow preload, shared by this window. */
  readonly preload: string;
  readonly devTools: boolean;
}

/** The multi-ticket add window the tray menu's Add tickets… opens (§7.20). */
export interface TicketBatchWindow {
  /** Opens the window, or brings the open one forward with what it holds. */
  readonly show: () => void;
  /** Whether IPC came from this window's page, for handlers it may call. */
  readonly isSender: (contents: Electron.WebContents) => boolean;
  /** Asks the window to close, so its page can keep unsaved tickets with a prompt. */
  readonly close: () => void;
  /** Closes the window without asking, as when its server connection ends. */
  readonly destroy: () => void;
}

/**
 * Opens a normal framed window with the same isolation as the app window: context
 * isolation, the sandbox, no Node integration, the same preload, no pop-ups and no
 * navigation away from its page. Unlike the tray card, it stays open when it loses focus.
 */
function openBatchWindow({ url, preload, devTools }: TicketBatchWindowOptions) {
  const batch = new BrowserWindow({
    title: "Add tickets",
    width: 960,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools,
    },
  });
  batch.removeMenu();
  batch.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  batch.webContents.on("will-navigate", (event, target) => {
    if (target !== url) {
      event.preventDefault();
    }
  });
  return batch;
}

/**
 * The page refuses to unload while it holds tickets that Done has not saved. Electron
 * then asks main, which confirms with the user; preventing the event lets the close go on.
 */
function confirmDiscard(window: BrowserWindow, event: Electron.Event) {
  const response = dialog.showMessageBoxSync(window, {
    type: "question",
    title: "Discard tickets?",
    message: "Discard the tickets you haven't added?",
    detail: "Tickets are added to Task Tracker only when you press Done.",
    buttons: ["Discard", "Keep editing"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) {
    event.preventDefault();
  }
}

/** Creates the multi-ticket add controller. The window opens on the first request. */
export function createTicketBatchWindow(options: TicketBatchWindowOptions): TicketBatchWindow {
  let batch: BrowserWindow | undefined;

  const current = () => (batch !== undefined && !batch.isDestroyed() ? batch : undefined);

  const open = () => {
    const window = openBatchWindow(options);
    batch = window;
    window.webContents.on("will-prevent-unload", (event) => confirmDiscard(window, event));
    window.once("ready-to-show", () => window.show());
    window.webContents.on("render-process-gone", () => window.destroy());
    window.once("closed", () => {
      if (batch === window) {
        batch = undefined;
      }
    });
    void window.loadURL(options.url).catch(() => undefined);
  };

  const show = () => {
    const window = current();
    if (window === undefined) {
      open();
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  };

  return {
    show,
    isSender: (contents) => current()?.webContents === contents,
    close: () => current()?.close(),
    destroy: () => current()?.destroy(),
  };
}
