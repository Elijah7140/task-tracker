import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  linuxStartupEntry,
  resolveConfigDirectory,
} from "../../src/installation/linux-startup-entry.js";

let root: string;
let configDirectory: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "task-tracker-autostart-"));
  configDirectory = join(root, "config");
});

afterEach(() => rm(root, { recursive: true, force: true }));

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

describe("linuxStartupEntry", () => {
  it("Writing creates the autostart folder and desktop file", async () => {
    const entry = linuxStartupEntry(configDirectory, "/home/alex/Apps/TaskTracker.AppImage");

    await entry.write();

    const expectedPath = join(configDirectory, "autostart", "task-tracker.desktop");
    expect(entry.filePath).toBe(expectedPath);
    const lines = (await readFile(expectedPath, "utf8")).split("\n");
    expect(lines[0]).toBe("[Desktop Entry]");
    expect(lines).toContain("Type=Application");
    expect(lines).toContain("Name=Task Tracker");
    expect(lines).toContain('Exec="/home/alex/Apps/TaskTracker.AppImage"');
  });

  it("Special characters in the path are escaped for the Exec key", async () => {
    const entry = linuxStartupEntry(
      configDirectory,
      '/home/alex/My $Apps/100%/Task"Tracker`\\.AppImage',
    );

    await entry.write();

    const expected = [
      "[Desktop Entry]",
      "Type=Application",
      "Name=Task Tracker",
      'Exec="/home/alex/My \\\\$Apps/100%%/Task\\\\"Tracker\\\\`\\\\\\\\.AppImage"',
      "Terminal=false",
      "X-GNOME-Autostart-enabled=true",
      "",
    ].join("\n");
    expect(await readFile(entry.filePath, "utf8")).toBe(expected);
  });

  it("Control characters in the path are escaped as string values", async () => {
    const entry = linuxStartupEntry(configDirectory, "/home/alex/a\tb\nc.AppImage");

    await entry.write();

    expect(await readFile(entry.filePath, "utf8")).toContain(
      'Exec="/home/alex/a\\tb\\nc.AppImage"\n',
    );
  });

  it("Writing twice leaves one identical file", async () => {
    const entry = linuxStartupEntry(configDirectory, "/opt/TaskTracker.AppImage");
    await entry.write();
    const first = await readFile(entry.filePath, "utf8");

    await entry.write();

    expect(await readFile(entry.filePath, "utf8")).toBe(first);
  });

  it("Removing deletes the desktop file", async () => {
    const entry = linuxStartupEntry(configDirectory, "/opt/TaskTracker.AppImage");
    await entry.write();

    await entry.remove();

    expect(await exists(entry.filePath)).toBe(false);
  });

  it("Removing when nothing was written does nothing", async () => {
    const entry = linuxStartupEntry(configDirectory, "/opt/TaskTracker.AppImage");

    await entry.remove();

    expect(await exists(configDirectory)).toBe(false);
  });
});

describe("resolveConfigDirectory", () => {
  it("An absolute XDG_CONFIG_HOME is honoured", () => {
    const resolved = resolveConfigDirectory(configDirectory, "/home/alex");

    expect(resolved).toBe(configDirectory);
  });

  it.each([undefined, "", "relative/config"])(
    "Without a usable XDG_CONFIG_HOME %j the home config folder is used",
    (xdgConfigHome) => {
      const home = join(root, "home");

      const resolved = resolveConfigDirectory(xdgConfigHome, home);

      expect(resolved).toBe(join(home, ".config"));
    },
  );
});
