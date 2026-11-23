import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** electron-builder's output directory. */
export const packageOutput = fileURLToPath(new URL("../dist/package", import.meta.url));

/** The manifest the packaging step wrote into the app, which carries the packaged version. */
export const packagedManifest = fileURLToPath(
  new URL("../dist/staging/app/package.json", import.meta.url),
);

/** The native unpacked executable retained for Playwright smoke tests. */
export const unpackedExecutable =
  process.platform === "darwin"
    ? join(packageOutput, "mac-arm64", "Task Tracker.app", "Contents", "MacOS", "Task Tracker")
    : process.platform === "win32"
      ? join(packageOutput, "win-unpacked", "task-tracker.exe")
      : join(packageOutput, "linux-unpacked", "task-tracker");
