import { execFile } from "node:child_process";

/** Runs a command and resolves its standard output, rejecting on failure or timeout. */
export type RunCommand = (file: string, args: readonly string[]) => Promise<string>;

const WATCHER_NAME = "org.kde.StatusNotifierWatcher";
const PROBE_TIMEOUT_MILLIS = 2_000;

/** Asks the session bus whether a StatusNotifierWatcher owns its name. */
const NAME_HAS_OWNER = [
  "--session",
  "--print-reply=literal",
  `--reply-timeout=${PROBE_TIMEOUT_MILLIS}`,
  "--dest=org.freedesktop.DBus",
  "/org/freedesktop/DBus",
  "org.freedesktop.DBus.NameHasOwner",
  `string:${WATCHER_NAME}`,
];

/** Runs a short command with a deadline and no inherited input. */
export const runCommand: RunCommand = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: PROBE_TIMEOUT_MILLIS, windowsHide: true }, (error, stdout) => {
      if (error === null) {
        resolve(stdout);
      } else {
        reject(error);
      }
    });
  });

/**
 * Tells whether the desktop will really show a notification-area icon (§7.12).
 * Windows and macOS always have one. On Linux the icon needs a
 * StatusNotifierWatcher on the session bus; without `dbus-send` or a bus the
 * answer is no, so closing minimises instead of hiding.
 */
export async function isTrayHostAvailable(
  platform: NodeJS.Platform,
  run: RunCommand = runCommand,
): Promise<boolean> {
  if (platform === "win32" || platform === "darwin") {
    return true;
  }
  if (platform !== "linux") {
    return false;
  }
  try {
    const reply = await run("dbus-send", NAME_HAS_OWNER);
    return /\bboolean true\b/.test(reply);
  } catch {
    return false;
  }
}
