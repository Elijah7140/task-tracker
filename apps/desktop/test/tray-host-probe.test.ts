import { describe, expect, it } from "vitest";
import { isTrayHostAvailable, type RunCommand } from "../src/tray-host-probe.js";

const replying =
  (reply: string): RunCommand =>
  async () =>
    reply;

describe("isTrayHostAvailable", () => {
  it.each<NodeJS.Platform>(["win32", "darwin"])(
    "Trusts the notification area on %s",
    async (os) => {
      const run: RunCommand = () => Promise.reject(new Error("Not called."));

      const available = await isTrayHostAvailable(os, run);

      expect(available).toBe(true);
    },
  );

  it("Asks the Linux session bus for a StatusNotifierWatcher", async () => {
    const calls: Array<readonly [string, readonly string[]]> = [];
    const run: RunCommand = async (file, args) => {
      calls.push([file, args]);
      return "   boolean true\n";
    };

    const available = await isTrayHostAvailable("linux", run);

    expect(available).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("dbus-send");
    expect(calls[0]?.[1]).toContain("string:org.kde.StatusNotifierWatcher");
  });

  it("Reports no tray host when no watcher owns the name", async () => {
    const available = await isTrayHostAvailable("linux", replying("   boolean false\n"));

    expect(available).toBe(false);
  });

  it("Reports no tray host when the bus or dbus-send is unavailable", async () => {
    const run: RunCommand = () => Promise.reject(new Error("spawn dbus-send ENOENT"));

    const available = await isTrayHostAvailable("linux", run);

    expect(available).toBe(false);
  });
});
