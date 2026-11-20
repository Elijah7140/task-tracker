import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

/**
 * A short name derived from the user and the full database path, safe for a
 * directory name. Windows paths are compared without case, as the file system does.
 */
export function instanceName(
  databasePath: string,
  userName: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const fullPath = resolve(databasePath);
  const path = platform === "win32" ? fullPath.toUpperCase() : fullPath;
  const hash = createHash("sha256").update(`${userName}\n${path}`, "utf8").digest("hex");
  return `TaskTracker-${hash.slice(0, 32)}`;
}

/**
 * The profile directory that scopes Electron's single-instance lock (§7.12).
 * The default database keeps the profile, so one app runs per user. A database
 * override, such as a test path, gets its own profile beneath it, so different
 * databases run side by side while a second launch on the same one is refused.
 */
export function instanceProfile(
  profile: string,
  databaseOverride: string | undefined,
  userName: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (databaseOverride === undefined || databaseOverride === "") {
    return profile;
  }
  return join(profile, "instances", instanceName(databaseOverride, userName, platform));
}
