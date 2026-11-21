import { BrowserWindow, screen } from "electron";
import { Effect } from "effect";
import { trayCardHeight } from "./tray-card-height.js";
import { placeTrayCard, type ScreenPoint } from "./tray-card-placement.js";
import { makeTrayCardToggle } from "./tray-card-toggle.js";

/** The card's width in device-independent pixels; the renderer draws a 320-pixel card. */
const CARD_WIDTH = 320;

/** What the tray card window loads and how. */
export interface TrayCardWindowOptions {
  /** The renderer page with the tray card hash. Navigation anywhere else is refused. */
  readonly url: string;
  /** The app window's narrow preload, shared by the card. */
  readonly preload: string;
  readonly devTools: boolean;
}

/** The small borderless window the tray icon's left click shows (§7.18). */
export interface TrayCardWindow {
  /** Shows the card by the tray icon, or hides it when it is showing. */
  readonly toggle: () => void;
  readonly hide: () => void;
  /** Whether IPC came from the card's page, for handlers only the card may call. */
  readonly isSender: (contents: Electron.WebContents) => boolean;
  /** Fits the window to the height the card's page reports, within fixed bounds. */
  readonly resize: (reported: unknown) => void;
  /** Closes the card for good, as when its server connection ends or the app quits. */
  readonly destroy: () => void;
}

/** Windows reads the cursor over the icon; elsewhere the card goes top-right, as in legacy. */
function trayCursor(): ScreenPoint | undefined {
  return process.platform === "win32" ? screen.getCursorScreenPoint() : undefined;
}

/**
 * Opens the card with the same isolation as the app window: context isolation,
 * the sandbox, no Node integration, the same preload and session permissions,
 * no pop-ups and no navigation away from its page. It is created on the first
 * click, fits the card's reported height, and hides on Escape or when it loses focus.
 */
function openCardWindow({ url, preload, devTools }: TrayCardWindowOptions) {
  const card = new BrowserWindow({
    title: "In progress",
    width: CARD_WIDTH,
    height: 200,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools,
    },
  });
  card.removeMenu();
  card.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  card.webContents.on("will-navigate", (event, target) => {
    if (target !== url) {
      event.preventDefault();
    }
  });
  return card;
}

/** What the card window reports back to its controller. */
interface CardWindowEvents {
  readonly hide: () => void;
  readonly place: (window: BrowserWindow) => void;
  readonly ready: (window: BrowserWindow) => void;
  readonly gone: () => void;
  readonly closed: (window: BrowserWindow) => void;
}

/** Hides on focus loss and Escape and reports the window's life. */
function watchCardWindow(window: BrowserWindow, events: CardWindowEvents) {
  window.on("blur", events.hide);
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      events.hide();
    }
  });
  window.once("ready-to-show", () => events.ready(window));
  window.webContents.on("render-process-gone", events.gone);
  window.once("closed", () => events.closed(window));
}

/** Puts the card by the tray icon, inside the working area of the cursor's or primary screen. */
function placeCardWindow(window: BrowserWindow, anchor: ScreenPoint | undefined) {
  const display =
    anchor === undefined ? screen.getPrimaryDisplay() : screen.getDisplayNearestPoint(anchor);
  const [width = CARD_WIDTH, height = 200] = window.getSize();
  const position = placeTrayCard(display.workArea, { width, height }, anchor);
  window.setPosition(Math.round(position.x), Math.round(position.y));
}

/** Creates the tray card controller. The window itself opens on the first click. */
export function createTrayCardWindow(options: TrayCardWindowOptions): TrayCardWindow {
  let card: BrowserWindow | undefined;
  let ready = false;
  let showWhenReady = false;
  let anchor: ScreenPoint | undefined;

  const reveal = (window: BrowserWindow) => {
    showWhenReady = false;
    placeCardWindow(window, anchor);
    window.show();
    window.focus();
  };

  const destroy = () => {
    const window = card;
    card = undefined;
    ready = false;
    showWhenReady = false;
    if (window !== undefined && !window.isDestroyed()) {
      window.destroy();
    }
  };

  const toggle = makeTrayCardToggle({
    isVisible: () => card?.isVisible() === true,
    show: () => {
      anchor = trayCursor();
      const window = ensureWindow();
      if (ready) {
        reveal(window);
      } else {
        showWhenReady = true;
      }
    },
    hide: () => {
      showWhenReady = false;
      card?.hide();
    },
  });
  const hide = () => Effect.runSync(toggle.hide);

  const events: CardWindowEvents = {
    hide,
    place: (window) => placeCardWindow(window, anchor),
    ready: (window) => {
      ready = true;
      if (showWhenReady) {
        reveal(window);
      }
    },
    gone: destroy,
    closed: (window) => {
      if (card === window) {
        card = undefined;
        ready = false;
      }
    },
  };

  function ensureWindow() {
    if (card !== undefined && !card.isDestroyed()) {
      return card;
    }
    const window = openCardWindow(options);
    card = window;
    ready = false;
    watchCardWindow(window, events);
    void window.loadURL(options.url).catch(() => undefined);
    return window;
  }

  return {
    toggle: () => Effect.runSync(toggle.click),
    hide,
    isSender: (contents) =>
      card !== undefined && !card.isDestroyed() && contents === card.webContents,
    resize: (reported) => {
      const height = trayCardHeight(reported);
      if (height !== undefined && card !== undefined && !card.isDestroyed()) {
        card.setContentSize(CARD_WIDTH, height);
        placeCardWindow(card, anchor);
      }
    },
    destroy,
  };
}
