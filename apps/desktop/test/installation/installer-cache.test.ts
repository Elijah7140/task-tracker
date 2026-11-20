import { describe, expect, it } from "vitest";
import { installerCacheDirectory } from "../../src/installation/installer-cache.js";

const windowsInstall = {
  kind: "windows-installer",
  executable: "C:\\Users\\Ada\\AppData\\Local\\Programs\\task-tracker\\task-tracker.exe",
} as const;

describe("installerCacheDirectory", () => {
  it("Names the installer's copy beside the per-user Windows installation", () => {
    const directory = installerCacheDirectory(windowsInstall, "C:\\Users\\Ada\\AppData\\Local");

    expect(directory).toBe("C:\\Users\\Ada\\AppData\\Local\\task-tracker-updater");
  });

  it("Leaves builds that were not installed by the Windows installer alone", () => {
    const appImage = { kind: "appimage", path: "/home/ada/Apps/TaskTracker.AppImage" } as const;

    const forAppImage = installerCacheDirectory(appImage, "C:\\Users\\Ada\\AppData\\Local");
    const forUnpacked = installerCacheDirectory(undefined, "C:\\Users\\Ada\\AppData\\Local");

    expect(forAppImage).toBeUndefined();
    expect(forUnpacked).toBeUndefined();
  });

  it("Removes nothing without an absolute local application data folder", () => {
    const missing = installerCacheDirectory(windowsInstall, undefined);
    const relative = installerCacheDirectory(windowsInstall, "AppData\\Local");

    expect(missing).toBeUndefined();
    expect(relative).toBeUndefined();
  });
});
