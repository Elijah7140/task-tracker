import type { DesktopInstallation } from "@task-tracker/contracts";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import type { StartupRegistration } from "./startup-registration.js";
import type { UpdateHandoff } from "./update-handoff.js";
import type { UpdateService } from "./update-service.js";

/** What the installation handlers need from Electron main. */
export interface InstallationHost {
  readonly isRendererFrame: (event: IpcMainInvokeEvent) => boolean;
  readonly version: string;
  readonly updates: UpdateService;
  readonly startup: StartupRegistration;
  /** Quits the app and finishes the update with `handoff`. */
  readonly restartWith: (handoff: UpdateHandoff) => void;
}

function describe(host: InstallationHost): typeof DesktopInstallation.Type {
  return {
    version: host.version,
    canUpdate: host.updates.canUpdate,
    startWithSystemAvailable: host.startup.available,
    readyVersion: host.updates.readyVersion(),
  };
}

/** Prepares and starts the handoff. A failure leaves the update ready and reports false. */
async function restart(host: InstallationHost) {
  try {
    const handoff = await host.updates.prepareRestart();
    if (handoff === undefined) {
      return false;
    }
    host.restartWith(handoff);
    return true;
  } catch (error) {
    console.warn(`Could not restart to update: ${String(error)}`);
    return false;
  }
}

/**
 * Registers App Settings' installed-build calls (§4, §7.13). Only the app
 * window's main frame may call them. The renderer sends no addresses or paths:
 * main owns the feed, the downloads and the OS entry, and the only argument,
 * the start-with-system choice, must be a boolean.
 */
export function registerInstallationHandlers(host: InstallationHost) {
  const handle = (channel: string, listener: (value: unknown) => unknown, refused: unknown) => {
    ipcMain.handle(channel, (event, value: unknown) =>
      host.isRendererFrame(event) ? listener(value) : refused,
    );
  };
  handle("task-tracker:get-installation", () => describe(host), null);
  handle("task-tracker:check-for-updates", () => host.updates.check(), null);
  handle("task-tracker:download-update", () => host.updates.download(), false);
  handle("task-tracker:restart-to-update", () => restart(host), false);
  handle(
    "task-tracker:apply-start-with-system",
    (value) => (typeof value === "boolean" ? host.startup.apply(value) : false),
    false,
  );
}
