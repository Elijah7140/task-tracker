import { BrowserWindow, screen } from "electron";
import { Effect } from "effect";
import { trayCardHeight } from "./tray-card-height.js";
import { placeTrayCard, type ScreenPoint, TRAY_CARD_MARGIN } from "./tray-card-placement.js";
import { makeTrayCardToggle } from "./tray-card-toggle.js";
import { DEFAULT_CARD_WIDTH, trayCardWidth } from "./tray-card-width.js";

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
  /**
   * Fits the window to the width and height the card's page reports: one card wide, and
   * as tall as the card up to the working area's height, after which the card scrolls.
   */
  readonly resize: (width: unknown, height: unknown) => void;
  /**
   * While true, a field in the card holds unsaved typing, so Escape and focus loss leave
   * the card showing (§7.18). Releasing the hold after focus has left hides the card. The
   * value crosses IPC from a renderer, so anything but a boolean is ignored.
   */
  readonly hold: (requested: unknown) => void;
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
 * click, fits the card's reported size, and hides on Escape or when it loses
 * focus, unless a field holds unsaved typing.
 */
function openCardWindow({ url, preload, devTools }: TrayCardWindowOptions) {
  const card = new BrowserWindow({
    title: "In progress",
    width: DEFAULT_CARD_WIDTH,
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
  /** Escape or focus loss: hides the card unless a field holds unsaved typing. */
  readonly dismiss: () => void;
  readonly place: (window: BrowserWindow) => void;
  readonly ready: (window: BrowserWindow) => void;
  readonly gone: () => void;
  readonly closed: (window: BrowserWindow) => void;
}

/**
 * Dismisses on focus loss and Escape and reports the window's life. Escape reaches the
 * page too, where it clears an add line or cancels a notes edit.
 */
function watchCardWindow(window: BrowserWindow, events: CardWindowEvents) {
  window.on("blur", events.dismiss);
  window.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      events.dismiss();
    }
  });
  window.once("ready-to-show", () => events.ready(window));
  window.webContents.on("render-process-gone", events.gone);
  window.once("closed", () => events.closed(window));
}

/** The screen the card shows on: the cursor's, or the primary screen without a cursor. */
function cardDisplay(anchor: ScreenPoint | undefined) {
  return anchor === undefined ? screen.getPrimaryDisplay() : screen.getDisplayNearestPoint(anchor);
}

/** Puts the card by the tray icon, inside the working area of the cursor's or primary screen. */
function placeCardWindow(window: BrowserWindow, anchor: ScreenPoint | undefined) {
  const [width = DEFAULT_CARD_WIDTH, height = 200] = window.getSize();
  const position = placeTrayCard(cardDisplay(anchor).workArea, { width, height }, anchor);
  window.setPosition(Math.round(position.x), Math.round(position.y));
}

/** Fits the card window to its page's reported size, as tall as its screen's working area allows. */
function fitCardWindow(
  window: BrowserWindow,
  anchor: ScreenPoint | undefined,
  reported: { readonly width: unknown; readonly height: unknown },
) {
  const tallest = cardDisplay(anchor).workArea.height - 2 * TRAY_CARD_MARGIN;
  const width = trayCardWidth(reported.width);
  const height = trayCardHeight(reported.height, tallest);
  if (width === undefined || height === undefined) {
    return;
  }
  window.setContentSize(width, height);
  placeCardWindow(window, anchor);
}

/** Creates the tray card controller. The window itself opens on the first click. */
export function createTrayCardWindow(options: TrayCardWindowOptions): TrayCardWindow {
  let card: BrowserWindow | undefined;
  let ready = false;
  let showWhenReady = false;
  let anchor: ScreenPoint | undefined;
  let held = false;

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
    dismiss: () => {
      if (!held) {
        hide();
      }
    },
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
    resize: (width, height) => {
      if (card !== undefined && !card.isDestroyed()) {
        fitCardWindow(card, anchor, { width, height });
      }
    },
    hold: (requested) => {
      if (typeof requested !== "boolean") {
        return;
      }
      held = requested;
      if (!held && card !== undefined && !card.isDestroyed() && !card.isFocused()) {
        hide();
      }
    },
    destroy,
  };
}
