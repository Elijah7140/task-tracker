import { describe, expect, it } from "vitest";
import { detectInstalledApp, type InstallProbe } from "../../src/installation/installed-app.js";

const linux: InstallProbe = {
  isPackaged: true,
  platform: "linux",
  executable: "/tmp/.mount_task/task-tracker",
  environment: { APPIMAGE: "/home/alex/Apps/TaskTracker.AppImage" },
  isFile: (path) => path === "/home/alex/Apps/TaskTracker.AppImage",
};

const windows: InstallProbe = {
  isPackaged: true,
  platform: "win32",
  executable: "C:\\Users\\alex\\AppData\\Local\\Programs\\task-tracker\\task-tracker.exe",
  environment: {},
  isFile: (path) =>
    path === "C:\\Users\\alex\\AppData\\Local\\Programs\\task-tracker\\Uninstall Task Tracker.exe",
};

describe("detectInstalledApp", () => {
  it("Finds the AppImage that started the app on Linux", () => {
    const installed = detectInstalledApp(linux);

    expect(installed).toEqual({ kind: "appimage", path: "/home/alex/Apps/TaskTracker.AppImage" });
  });

  it("Finds the per-user installation next to its uninstaller on Windows", () => {
    const installed = detectInstalledApp(windows);

    expect(installed).toEqual({ kind: "windows-installer", executable: windows.executable });
  });

  it.each<[string, InstallProbe]>([
    ["a development build", { ...linux, isPackaged: false }],
    ["an unpacked Linux build", { ...linux, environment: {} }],
    ["a relative AppImage path", { ...linux, environment: { APPIMAGE: "TaskTracker.AppImage" } }],
    ["a missing AppImage", { ...linux, isFile: () => false }],
    ["a Windows build without an uninstaller", { ...windows, isFile: () => false }],
    ["macOS", { ...linux, platform: "darwin" }],
  ])("Treats %s as not installed", (_case, probe) => {
    const installed = detectInstalledApp(probe);

    expect(installed).toBeUndefined();
  });
});
