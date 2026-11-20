import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { UpdateCheckResult } from "@task-tracker/contracts";
import { Effect } from "effect";
import type { InstalledApp } from "./installed-app.js";
import {
  clearUpdateDirectory,
  forgetPendingUpdate,
  type PendingUpdate,
  readPendingUpdate,
  writePendingUpdate,
} from "./pending-update.js";
import { isNewerStableRelease } from "./release-version.js";
import {
  checkFeed,
  downloadCandidate,
  type FetchUpdate,
  fileMatches,
  type UpdateCandidate,
} from "./update-client.js";
import { prepareHandoff, type UpdateHandoff } from "./update-handoff.js";

/** What the update service needs from Electron main. */
export interface UpdateServiceOptions {
  readonly currentVersion: string;
  /** The installed build, or undefined for a build that cannot update itself. */
  readonly installed: InstalledApp | undefined;
  /** The release feed folder, or undefined when none is configured. */
  readonly feed: URL | undefined;
  /** The updater's own folder inside the app profile. */
  readonly directory: string;
  readonly fetch: FetchUpdate;
  readonly platform: NodeJS.Platform;
}

/** Manual update checks, verified downloads and the install handoff (§7.13). */
export interface UpdateService {
  /** Whether this installed build can update itself. */
  readonly canUpdate: boolean;
  /** The version downloaded and verified in this session, awaiting a restart. */
  readonly readyVersion: () => string | null;
  /** Asks the feed for a newer stable release. An uninstalled build makes no request. */
  readonly check: () => Promise<typeof UpdateCheckResult.Type>;
  /** Downloads and verifies the release the last check found. */
  readonly download: () => Promise<boolean>;
  /** Re-verifies the ready download and prepares the handoff, or undefined if it cannot install. */
  readonly prepareRestart: () => Promise<UpdateHandoff | undefined>;
  /** At launch, prepares to install a download left from an earlier session, once. */
  readonly takePendingAtStartup: () => Promise<UpdateHandoff | undefined>;
}

function pendingFrom(candidate: UpdateCandidate): PendingUpdate {
  const { url, sha512, size } = candidate.file;
  return { version: candidate.version, fileName: url, sha512, size };
}

/** Creates the service. Every network request and file write stays in Electron main. */
export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  const { installed, directory } = options;
  let candidate: UpdateCandidate | undefined;
  let ready: PendingUpdate | undefined;

  /**
   * Verifies the recorded file again and prepares the handoff, discarding a file
   * that no longer matches. The record is forgotten once the handoff is ready, so
   * an install that fails later is not retried at every launch. A handoff that
   * throws, such as an AppImage folder that cannot be written, keeps the record.
   */
  const handOff = async (pending: PendingUpdate, app: InstalledApp) => {
    const file = join(directory, pending.fileName);
    if (!(await Effect.runPromise(fileMatches(file, pending)))) {
      await clearUpdateDirectory(directory);
      return undefined;
    }
    const handoff = await prepareHandoff(app, file);
    await forgetPendingUpdate(directory);
    return handoff;
  };

  const check = async (): Promise<typeof UpdateCheckResult.Type> => {
    candidate = undefined;
    if (installed === undefined) {
      return { outcome: "not-installed" };
    }
    if (options.feed === undefined) {
      return { outcome: "feed-unavailable" };
    }
    const { feed, fetch, platform, currentVersion } = options;
    const result = await Effect.runPromise(checkFeed({ fetch, feed, platform, currentVersion }));
    if (result.outcome !== "available") {
      return result;
    }
    candidate = result.candidate;
    return { outcome: "available", version: result.candidate.version };
  };

  const download = async () => {
    const offered = candidate;
    if (offered === undefined) {
      return false;
    }
    ready = undefined;
    await clearUpdateDirectory(directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = await Effect.runPromise(
      downloadCandidate({ fetch: options.fetch, candidate: offered, directory }),
    );
    if (path === undefined) {
      return false;
    }
    ready = pendingFrom(offered);
    await writePendingUpdate(directory, ready);
    return true;
  };

  const prepareRestart = async () => {
    const pending = ready;
    if (pending === undefined || installed === undefined) {
      return undefined;
    }
    ready = undefined;
    try {
      return await handOff(pending, installed);
    } catch (error) {
      // The verified download stays ready, so Restart to update can be retried.
      ready = pending;
      throw error;
    }
  };

  const takePendingAtStartup = async () => {
    if (installed === undefined) {
      return undefined;
    }
    const pending = await readPendingUpdate(directory);
    if (pending === undefined || !isNewerStableRelease(pending.version, options.currentVersion)) {
      await clearUpdateDirectory(directory);
      return undefined;
    }
    return handOff(pending, installed);
  };

  return {
    canUpdate: installed !== undefined,
    readyVersion: () => ready?.version ?? null,
    check,
    download,
    prepareRestart,
    takePendingAtStartup,
  };
}
