import { randomBytes } from "node:crypto";
import { chmod, copyFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { InstalledApp } from "./installed-app.js";

/**
 * The electron-builder NSIS installer runs silently as an update of the
 * installed app and starts it again when it finishes (WP41).
 */
export const WINDOWS_UPDATE_ARGUMENTS: readonly string[] = ["--updated", "/S", "--force-run"];

/** What Electron main does as it quits to finish an update. */
export type UpdateHandoff =
  | { readonly kind: "relaunch"; readonly executable: string }
  | {
      readonly kind: "run-installer";
      readonly installer: string;
      readonly args: readonly string[];
    };

/**
 * Copies the download beside the AppImage and renames it over the original, so
 * the stable path that start with system uses never holds a partial file.
 */
async function replaceAppImage(downloaded: string, appImage: string) {
  const suffix = randomBytes(6).toString("hex");
  const staged = join(dirname(appImage), `.${basename(appImage)}.${suffix}.update`);
  try {
    await copyFile(downloaded, staged);
    await chmod(staged, 0o755);
    await rename(staged, appImage);
  } finally {
    await rm(staged, { force: true });
  }
}

/**
 * Prepares to install a verified download (§7.13). Linux replaces the AppImage
 * now and relaunches it on quit. Windows runs the installer after the app quits.
 * The caller verifies the download immediately before calling this.
 */
export async function prepareHandoff(
  installed: InstalledApp,
  downloaded: string,
): Promise<UpdateHandoff> {
  if (installed.kind === "appimage") {
    await replaceAppImage(downloaded, installed.path);
    return { kind: "relaunch", executable: installed.path };
  }
  return { kind: "run-installer", installer: downloaded, args: WINDOWS_UPDATE_ARGUMENTS };
}
