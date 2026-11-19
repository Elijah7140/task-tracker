import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RpcConnection } from "@task-tracker/contracts";
import { app, BrowserWindow, dialog, ipcMain, Menu, session } from "electron";
import {
  type RendererAddress,
  registerRendererScheme,
  rendererAddress,
  servePackagedRenderer,
} from "./renderer.js";
import { launchServer, type ServerProcess } from "./server-process.js";
import { serverStoppedPage } from "./server-stopped-page.js";

let window: BrowserWindow | undefined;
let server: ServerProcess | undefined;
let connection: RpcConnection | undefined;
let quitting = false;
let relaunchScheduled = false;

function focusWindow() {
  if (window?.isMinimized()) {
    window.restore();
  }
  window?.focus();
}

/**
 * The quitting instance keeps the single-instance lock until its server has stopped,
 * so a launch during that window starts the app again once the quit finishes.
 */
function onSecondInstance() {
  if (!quitting) {
    focusWindow();
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
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  renderer.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  renderer.webContents.on("render-process-gone", (_event, details) => {
    void handleRendererGone(renderer, url, details.reason);
  });
  renderer.webContents.on("will-navigate", (event, target) => {
    if (target.split("#")[0] !== url) {
      event.preventDefault();
    }
  });
  renderer.once("closed", () => {
    window = undefined;
  });
  return renderer;
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
  if (quitting || window === undefined) {
    return;
  }
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

/** Launches the server, waits for readiness and (re)loads the renderer. */
async function start(address: RendererAddress) {
  const entry = app.isPackaged
    ? join(process.resourcesPath, "server.mjs")
    : fileURLToPath(new URL("../../server/dist/main.js", import.meta.url));
  const child = launchServer(entry, address.origin);
  server = child;
  connection = await child.ready;
  if (quitting) {
    return;
  }
  void child.closed.then(({ diagnostic }) => handleCrash(diagnostic, address)).catch(startupFailed);
  window ??= createWindow(address.url);
  await window.loadURL(address.url);
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

async function openApplication() {
  const address = rendererAddress();
  if (app.isPackaged) {
    // Packaged builds offer no reload or developer tools shortcuts.
    Menu.setApplicationMenu(null);
    servePackagedRenderer(() => connection?.port);
  }
  denyPermissions();
  serveRpcConnection(address);
  await start(address);
}

/** The renderer needs no browser permissions such as camera, notifications or geolocation. */
function denyPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
}

/** Answers the preload bridge only for the main frame of the app window at the renderer page. */
function serveRpcConnection(address: RendererAddress) {
  ipcMain.handle("task-tracker:get-rpc-connection", (event) => {
    const frame = event.senderFrame;
    const trusted =
      event.sender === window?.webContents &&
      frame?.parent === null &&
      frame.url.split("#")[0] === address.url;
    if (!trusted) {
      throw new Error("RPC connection requested by an unexpected frame.");
    }
    return connection;
  });
}

if (app.requestSingleInstanceLock()) {
  registerRendererScheme();
  app.on("second-instance", onSecondInstance);
  app.on("before-quit", beforeQuit);
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(openApplication).catch(startupFailed);
} else {
  app.quit();
}
