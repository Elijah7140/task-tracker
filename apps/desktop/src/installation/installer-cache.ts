import { win32 } from "node:path";
import type { InstalledApp } from "./installed-app.js";

/**
 * The folder electron-builder's NSIS installer copies itself into on every
 * install and update, `%LOCALAPPDATA%\task-tracker-updater`. electron-updater
 * would diff against that copy. This app's updater never reads it, and the
 * uninstaller removes the folder (`installer/uninstall-leftovers.nsh`).
 */
export const INSTALLER_CACHE_FOLDER = "task-tracker-updater";

/**
 * Where the installer left its copy, for the per-user Windows installation, or
 * undefined for every other build or without an absolute `%LOCALAPPDATA%`.
 */
export function installerCacheDirectory(
  installed: InstalledApp | undefined,
  localAppData: string | undefined,
): string | undefined {
  if (installed?.kind !== "windows-installer" || localAppData === undefined) {
    return undefined;
  }
  return win32.isAbsolute(localAppData)
    ? win32.join(localAppData, INSTALLER_CACHE_FOLDER)
    : undefined;
}
