import { userInfo } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  externalLinkAddress,
  Guid,
  type RpcConnection,
  TRAY_CARD_HASH,
} from "@task-tracker/contracts";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Notification,
  powerMonitor,
  session,
  shell,
} from "electron";
import { Effect, Option, Schema } from "effect";
import { createAppTray } from "./app-tray.js";
import { instanceProfile } from "./instance-scope.js";
import {
  createDesktopInstallation,
  type DesktopInstallationServices,
  quitAndFinishUpdate,
} from "./installation/desktop-installation.js";
import { registerInstallationHandlers } from "./installation/installation-ipc.js";
import { makeNativeNotifier } from "./native-notifier.js";
import { createReminderNotifications } from "./reminder-notifications.js";
import {
  type RendererAddress,
  registerRendererScheme,
  rendererAddress,
  servePackagedRenderer,
} from "./renderer.js";
import type { ServerMessage } from "./server-messages.js";
import { launchServer, type ServerProcess } from "./server-process.js";
import { serverStoppedPage } from "./server-stopped-page.js";
import { registerTransferFileHandler } from "./transfer-file-handler.js";
import { createTrayCardWindow, type TrayCardWindow } from "./tray-card-window.js";
import { decideTrayClose } from "./tray-close-decision.js";

/** Sends the renderer what a clicked reminder notification opens. */
const REMINDER_ACTIVATED_CHANNEL = "task-tracker:reminder-activated";

let window: BrowserWindow | undefined;
let server: ServerProcess | undefined;
let connection: RpcConnection | undefined;
let quitting = false;
let relaunchScheduled = false;
/** The `KeepRunningInTray` setting as the server last reported it. */
let keepRunningInTray = false;
/** Whether a close hid the window to the tray, so only the tray or a new launch shows it. */
let hiddenInTray = false;

/** The checklist art shared by the tray icon and notifications. */
const iconPath = app.isPackaged
  ? join(process.resourcesPath, "icon.png")
  : fileURLToPath(new URL("../../../assets/icon.png", import.meta.url));

/** The current item card a left click on the tray icon shows (§7.18). */
let trayCard: TrayCardWindow | undefined;

const tray = createAppTray({
  iconPath,
  onOpen: showWindow,
  onQuit: () => app.quit(),
  onClick: () => trayCard?.toggle(),
});

const notifier = makeNativeNotifier(
  createReminderNotifications({
    iconPath,
    onActivate: activateReminder,
    onFailure: (error) => Effect.runFork(notifier.reportFailure(error)),
    platform: Notification,
  }),
  (message) => console.warn(message),
);

/** Shows a window hidden in the tray or minimised and brings it forward. */
function showWindow() {
  if (window === undefined) {
    return;
  }
  hiddenInTray = false;
  if (!window.isVisible()) {
    window.show();
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
}

/** Brings the window forward and asks the renderer to open the item, or the panel for a group. */
function activateReminder(itemId: string | null) {
  showWindow();
  window?.webContents.send(REMINDER_ACTIVATED_CHANNEL, { itemId });
}

/** Asks the server for a reminder check, as after a resume from sleep (§7.12). */
function requestReminderCheck() {
  server?.send({ type: "check-reminders" });
}

/** Follows the tray setting. A window hidden in a tray that went away comes back. */
async function applyTraySetting(enabled: boolean) {
  keepRunningInTray = enabled;
  await tray.setEnabled(enabled);
  if (!tray.shown() && hiddenInTray) {
    showWindow();
  }
}

function handleServerMessage(message: ServerMessage) {
  switch (message.type) {
    case "show-notification":
      Effect.runFork(notifier.notify(message.notification));
      return;
    case "keep-running-in-tray":
      void applyTraySetting(message.enabled);
      return;
  }
}

/**
 * The quitting instance keeps the single-instance lock until its server has stopped,
 * so a launch during that window starts the app again once the quit finishes.
 */
function onSecondInstance() {
  if (!quitting) {
    showWindow();
    return;
  }
  if (!relaunchScheduled) {
    relaunchScheduled = true;
    app.relaunch();
  }
}

/** Holds the quit until the server child has closed its database. */
function beforeQuit(event: Electron.Event) {
  if (server === undefined) {
    quitting = true;
    tray.destroy();
    return;
  }
  event.preventDefault();
  if (quitting) {
    return;
  }
  quitting = true;
  void server.stop().then(() => {
    server = undefined;
    app.quit();
  });
}

/** Opens the isolated renderer window and blocks pop-ups and navigation away from `url`. */
function createWindow(url: string) {
  const renderer = new BrowserWindow({
    title: "Task Tracker",
    width: 1200,
    height: 800,
    // The legacy window's minimum; narrower panes cannot fit Search and Calendar beside the sidebar.
    minWidth: 800,
    minHeight: 500,
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  // The page draws its own menu bar under the system title bar (§8), so Electron's stays hidden.
  renderer.setMenuBarVisibility(false);
  renderer.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  renderer.webContents.on("render-process-gone", (_event, details) => {
    void handleRendererGone(renderer, url, details.reason);
  });
  renderer.webContents.on("will-navigate", (event, target) => {
    if (target.split("#")[0] !== url) {
      event.preventDefault();
    }
  });
  renderer.on("close", (event) => handleClose(renderer, event));
  // Windows reports a sign-out or shutdown here; the app quits as usual then.
  renderer.on("session-end", () => {
    quitting = true;
  });
  renderer.on("focus", requestReminderCheck);
  renderer.once("closed", () => {
    window = undefined;
    // A hidden card would otherwise keep the app running after its last window.
    trayCard?.destroy();
  });
  return renderer;
}

/**
 * Hides to the tray or minimises instead of closing when reminders should keep
 * running. Electron does not say why a window closes, so a quit or the end of
 * the OS session marks `quitting` first and every other close is the user's.
 */
function handleClose(renderer: BrowserWindow, event: Electron.Event) {
  const state = {
    keepRunningInTray,
    trayIconShown: tray.shown(),
    minimized: renderer.isMinimized(),
    quitting,
  };
  const action = decideTrayClose(state, "user");
  if (action === "hide-to-tray") {
    event.preventDefault();
    hiddenInTray = true;
    renderer.hide();
  } else if (action === "minimize") {
    event.preventDefault();
    renderer.minimize();
  }
}

/** Offers to reload the page or quit after the renderer process ends unexpectedly. */
async function handleRendererGone(renderer: BrowserWindow, url: string, reason: string) {
  if (quitting || renderer.isDestroyed()) {
    return;
  }
  const { response } = await dialog.showMessageBox(renderer, {
    type: "error",
    title: "Task Tracker window stopped",
    message: "The Task Tracker window stopped unexpectedly.",
    detail: `Reason: ${reason}.`,
    buttons: ["Reload", "Quit"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0 || quitting || renderer.isDestroyed()) {
    app.quit();
    return;
  }
  await renderer.loadURL(url).catch(() => undefined);
}

/** Stops the renderer calling the dead RPC port while the restart dialog is open. */
async function showServerStopped(renderer: BrowserWindow) {
  renderer.webContents.stop();
  // A navigation started by main aborts any pending one, which rejects harmlessly.
  await renderer.loadURL(serverStoppedPage).catch(() => undefined);
}

/** Reports an unexpected server exit and restarts it on request. */
async function handleCrash(diagnostic: string, address: RendererAddress) {
  server = undefined;
  connection = undefined;
  // The card's page holds the old connection; the next click opens it afresh.
  trayCard?.destroy();
  if (quitting || window === undefined) {
    return;
  }
  showWindow();
  await showServerStopped(window);
  if (quitting || window === undefined) {
    return;
  }
  const { response } = await dialog.showMessageBox(window, {
    type: "error",
    title: "Task Tracker server stopped",
    message: "The Task Tracker server stopped unexpectedly.",
    detail: diagnostic,
    buttons: ["Restart", "Quit"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0 && !quitting) {
    await start(address);
  } else {
    app.quit();
  }
}

/**
 * Starts the server child. Its messages wait for the app to be ready, because
 * the tray and notifications need it.
 */
function spawnServer(address: RendererAddress) {
  const entry = app.isPackaged
    ? join(process.resourcesPath, "server.mjs")
    : fileURLToPath(new URL("../../server/dist/main.js", import.meta.url));
  const child = launchServer(entry, address.origin, undefined, (message) => {
    void app.whenReady().then(() => handleServerMessage(message));
  });
  server = child;
  return child;
}

/** Waits for the server (launching one unless given) and (re)loads the renderer. */
async function start(address: RendererAddress, child = spawnServer(address)) {
  connection = await child.ready;
  if (quitting) {
    return;
  }
  void child.closed.then(({ diagnostic }) => handleCrash(diagnostic, address)).catch(startupFailed);
  window ??= createWindow(address.url);
  await window.loadURL(address.url);
  hiddenInTray = false;
  window.show();
}

async function startupFailed(error: unknown) {
  if (quitting) {
    return;
  }
  await dialog.showMessageBox({
    type: "error",
    title: "Task Tracker could not start",
    message: "Task Tracker could not start.",
    detail: error instanceof Error ? error.message : String(error),
    buttons: ["Quit"],
  });
  app.quit();
}

/**
 * Installs an update downloaded in an earlier session before anything opens
 * (§7.13). True when the app is quitting to finish it.
 */
async function finishPendingUpdate(installation: DesktopInstallationServices) {
  try {
    const handoff = await installation.updates.takePendingAtStartup();
    if (handoff !== undefined) {
      quitAndFinishUpdate(handoff);
      return true;
    }
  } catch (error) {
    console.warn(`Could not install the downloaded update: ${String(error)}`);
  }
  return false;
}

/** The renderer address and the server started before the app was ready. */
interface EarlyStart {
  readonly address: RendererAddress;
  readonly child: ServerProcess;
}

/**
 * Starts the server before the app is ready (§4). Windows children inherit
 * every inheritable handle, and Chromium launches renderers only once it is
 * ready. A server spawned while one launched could inherit its pipe and keep
 * a crashed window from ever being reported.
 */
function startServerEarly(): EarlyStart | Error {
  try {
    const address = rendererAddress();
    const child = spawnServer(address);
    // A failure before the app is ready is reported once openApplication awaits it.
    child.ready.catch(() => undefined);
    return { address, child };
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function openApplication(early: EarlyStart | Error) {
  if (early instanceof Error) {
    throw early;
  }
  const { address, child } = early;
  const installation = createDesktopInstallation();
  if (await finishPendingUpdate(installation)) {
    return;
  }
  if (app.isPackaged) {
    // Packaged builds offer no reload or developer tools shortcuts.
    Menu.setApplicationMenu(null);
    servePackagedRenderer(() => connection?.port);
  }
  denyPermissions();
  trayCard = createTrayCardWindow({
    url: `${address.url}${TRAY_CARD_HASH}`,
    preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
    devTools: !app.isPackaged,
  });
  registerRendererHandlers(address, installation);
  powerMonitor.on("resume", requestReminderCheck);
  await start(address, child);
}

/** The renderer needs no browser permissions such as camera, notifications or geolocation. */
function denyPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
}

/** Limits native calls to the main frame of the app window at the renderer page. */
function isRendererFrame(event: Electron.IpcMainInvokeEvent, address: RendererAddress) {
  const frame = event.senderFrame;
  return (
    event.sender === window?.webContents &&
    frame?.parent === null &&
    frame.url.split("#")[0] === address.url
  );
}

/** Limits tray card calls to the main frame of the card window at the card page (§7.18). */
function isTrayCardFrame(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  address: RendererAddress,
) {
  const frame = event.senderFrame;
  return (
    trayCard?.isSender(event.sender) === true &&
    frame?.parent === null &&
    frame.url === `${address.url}${TRAY_CARD_HASH}`
  );
}

const decodeItemId = Schema.decodeUnknownOption(Guid);

/** Hides the card and opens a valid item in the main window, as reminder activation does. */
function openItemFromTrayCard(value: unknown) {
  const itemId = Option.getOrUndefined(decodeItemId(value));
  if (itemId === undefined) {
    return false;
  }
  trayCard?.hide();
  activateReminder(itemId);
  return true;
}

function registerRendererHandlers(
  address: RendererAddress,
  installation: DesktopInstallationServices,
) {
  registerInstallationHandlers({
    ...installation,
    isRendererFrame: (event) => isRendererFrame(event, address),
    restartWith: quitAndFinishUpdate,
  });
  registerTransferFileHandler({
    isRendererFrame: (event) => isRendererFrame(event, address),
    window: () => window,
    grant: (grant) => server?.send(grant) ?? false,
  });
  ipcMain.handle("task-tracker:get-rpc-connection", (event) => {
    if (!isRendererFrame(event, address) && !isTrayCardFrame(event, address)) {
      throw new Error("RPC connection requested by an unexpected frame.");
    }
    return connection;
  });
  ipcMain.handle("task-tracker:open-item-from-tray-card", (event, value: unknown) =>
    isTrayCardFrame(event, address) ? openItemFromTrayCard(value) : false,
  );
  ipcMain.on("task-tracker:tray-card-height", (event, value: unknown) => {
    if (isTrayCardFrame(event, address)) {
      trayCard?.resize(value);
    }
  });
  ipcMain.handle("task-tracker:open-external-link", async (event, value: unknown) => {
    const link = isRendererFrame(event, address) ? externalLinkAddress(value) : undefined;
    if (link === undefined) {
      return false;
    }
    try {
      await shell.openExternal(link);
      return true;
    } catch {
      return false;
    }
  });
}

/** Reads the OS user name for the instance scope, or nothing where the OS has none. */
function currentUserName() {
  try {
    return userInfo().username;
  } catch {
    return "";
  }
}

// One app runs per user and database (§7.12). The profile scopes Electron's lock.
app.setPath(
  "userData",
  instanceProfile(app.getPath("userData"), process.env.TASKTRACKER_DB_PATH, currentUserName()),
);
if (process.platform === "win32") {
  // Windows attributes toasts to the installed shortcut's application ID.
  app.setAppUserModelId("app.tasktracker.desktop");
}

if (app.requestSingleInstanceLock()) {
  registerRendererScheme();
  app.on("second-instance", onSecondInstance);
  app.on("before-quit", beforeQuit);
  app.on("window-all-closed", () => app.quit());
  const early = startServerEarly();
  void app
    .whenReady()
    .then(() => openApplication(early))
    .catch(startupFailed);
} else {
  app.quit();
}
