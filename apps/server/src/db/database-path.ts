import { homedir } from "node:os";
import { posix, win32 } from "node:path";

/** Resolves the configured database path or the legacy local application data location. */
export function databasePath({
  environment = process.env,
  platform = process.platform,
  home = homedir(),
}: {
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
} = {}): string {
  if (environment.TASKTRACKER_DB_PATH !== undefined) {
    return environment.TASKTRACKER_DB_PATH;
  }
  if (platform === "win32") {
    const base = environment.LOCALAPPDATA || win32.join(home, "AppData", "Local");
    return win32.join(base, "TaskTracker", "tasktracker.db");
  }
  if (platform === "darwin") {
    return posix.join(home, "Library", "Application Support", "TaskTracker", "tasktracker.db");
  }
  const dataHome = environment.XDG_DATA_HOME ?? "";
  const base = posix.isAbsolute(dataHome) ? dataHome : posix.join(home, ".local", "share");
  return posix.join(base, "TaskTracker", "tasktracker.db");
}
