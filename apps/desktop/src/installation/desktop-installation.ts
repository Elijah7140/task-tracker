import { spawn } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, net } from "electron";
import { displayVersion } from "./app-version.js";
import { detectInstalledApp, type InstalledApp } from "./installed-app.js";
import { replaceLegacyStartupEntry } from "./legacy-startup-entry.js";
import { startupEntryFor } from "./startup-entries.js";
import {
  createStartupRegistration,
  type StartupEntry,
  type StartupRegistration,
} from "./startup-registration.js";
import type { UpdateHandoff } from "./update-handoff.js";
import { resolveUpdateFeed } from "./update-feed.js";
import { createUpdateService, type UpdateService } from "./update-service.js";
import { systemRegRunner, windowsRunKey } from "./windows-run-key.js";

/** The installed-build services App Settings uses (§7.13). */
export interface DesktopInstallationServices {
  readonly version: string;
  readonly updates: UpdateService;
  readonly startup: StartupRegistration;
}

function isRegularFile(path: string) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/** The feed the packaging step recorded in the app's package.json, if any. */
function packagedFeed(): string | undefined {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(app.getAppPath(), "package.json"), "utf8"),
    );
    const feed: unknown =
      typeof manifest === "object" && manifest !== null
        ? Reflect.get(manifest, "taskTrackerUpdateFeed")
        : undefined;
    return typeof feed === "string" ? feed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * On an installed Windows build, replaces a leftover legacy `TaskTracker` Run value
 * with this app's entry in the background (§7.13). Other builds are left alone.
 */
function replaceLegacyStartupOnWindows(installed: InstalledApp | undefined, entry?: StartupEntry) {
  if (installed?.kind !== "windows-installer" || entry === undefined) {
    return;
  }
  const runKey = windowsRunKey(systemRegRunner(process.env.SystemRoot ?? "C:\\Windows"));
  void replaceLegacyStartupEntry(runKey, entry, (message) => console.warn(message));
}

/**
 * Builds the version, update service and start-with-system registration. Call
 * it after the profile path is final, because downloads live in the profile.
 */
export function createDesktopInstallation(): DesktopInstallationServices {
  const installed = detectInstalledApp({
    isPackaged: app.isPackaged,
    platform: process.platform,
    executable: process.execPath,
    environment: process.env,
    isFile: isRegularFile,
  });
  const version = displayVersion(app.getVersion());
  const updates = createUpdateService({
    currentVersion: version,
    installed,
    feed: resolveUpdateFeed(process.env.TASKTRACKER_UPDATE_FEED_URL, packagedFeed()),
    directory: join(app.getPath("userData"), "updates"),
    fetch: (address, init) => net.fetch(address, init),
    platform: process.platform,
  });
  const entry = startupEntryFor(installed, {
    environment: process.env,
    homeDirectory: homedir(),
    loginItems: {
      set: (settings) => app.setLoginItemSettings({ ...settings, args: [...settings.args] }),
      get: (query) => app.getLoginItemSettings({ ...query, args: [...query.args] }),
    },
  });
  replaceLegacyStartupOnWindows(installed, entry);
  const startup = createStartupRegistration(entry, (message) => console.warn(message));
  return { version, updates, startup };
}

/**
 * Quits normally, so the server closes the database first, and then finishes the
 * update: Linux relaunches the replaced AppImage and Windows starts the installer.
 */
export function quitAndFinishUpdate(handoff: UpdateHandoff) {
  if (handoff.kind === "relaunch") {
    app.relaunch({ execPath: handoff.executable, args: [] });
  } else {
    app.once("will-quit", () => {
      spawn(handoff.installer, [...handoff.args], { detached: true, stdio: "ignore" }).unref();
    });
  }
  app.quit();
}
