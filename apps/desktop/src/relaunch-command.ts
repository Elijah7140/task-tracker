import { posix } from "node:path";
import type { RelaunchCommand } from "./relaunch-after-exit.js";

type Environment = Readonly<Record<string, string | undefined>>;

/** How the running app was started, as `process.execPath`, `process.argv.slice(1)` and `process.env` report it. */
export interface RunningApp {
  readonly executable: string;
  readonly args: readonly string[];
  readonly environment: Environment;
}

/** Variables the AppImage runtime sets afresh on every launch to describe its mount. */
const RUNTIME_VARIABLES = new Set(["APPIMAGE", "APPDIR", "OWD", "ARGV0"]);

/** Search paths electron-builder's AppRun prepends with directories inside the mount. */
const MOUNT_SEARCH_PATHS = new Set([
  "PATH",
  "LD_LIBRARY_PATH",
  "XDG_DATA_DIRS",
  "GSETTINGS_SCHEMA_DIR",
]);

/** Whether the absolute `path` is `directory` or lies below it. */
function isInside(directory: string, path: string) {
  if (!posix.isAbsolute(path)) {
    return false;
  }
  const relative = posix.relative(directory, path);
  return !relative.startsWith("..") && !posix.isAbsolute(relative);
}

/** Removes the entries of a colon-separated search path that lie inside `mount`. */
function withoutMountEntries(value: string, mount: string) {
  return value
    .split(":")
    .filter((entry) => !isInside(mount, entry))
    .join(":");
}

/** The AppImage's mount directory, when `APPDIR` names one that search paths could point into. */
function mountOf(environment: Environment) {
  const mount = environment.APPDIR;
  return mount !== undefined && posix.isAbsolute(mount) && mount !== "/" ? mount : undefined;
}

/** A variable's value for the fresh launch, or nothing to leave it out. */
function freshValue(name: string, value: string | undefined, mount: string | undefined) {
  if (value === undefined || RUNTIME_VARIABLES.has(name)) {
    return undefined;
  }
  if (mount === undefined || !MOUNT_SEARCH_PATHS.has(name)) {
    return value;
  }
  const kept = withoutMountEntries(value, mount);
  return kept === "" ? undefined : kept;
}

/**
 * The environment for a fresh AppImage launch: without the runtime's variables
 * and without search path entries into the mount that goes away at exit. The
 * new runtime and AppRun set these again for their own mount.
 */
function freshAppImageEnvironment(environment: Environment) {
  const mount = mountOf(environment);
  const fresh: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    const kept = freshValue(name, value, mount);
    if (kept !== undefined) {
      fresh[name] = kept;
    }
  }
  return fresh;
}

/**
 * What starts this app again with the same arguments. Inside an AppImage,
 * `process.execPath` lies in the AppImage's temporary mount, which disappears
 * once the app exits, so the relaunch starts the AppImage file named in
 * `APPIMAGE` instead. Other builds restart the running executable with this
 * process's environment.
 */
export function relaunchCommand(running: RunningApp): RelaunchCommand {
  const appImage = running.environment.APPIMAGE;
  if (appImage === undefined || !posix.isAbsolute(appImage)) {
    return { executable: running.executable, args: running.args };
  }
  return {
    executable: appImage,
    args: running.args,
    environment: freshAppImageEnvironment(running.environment),
  };
}
