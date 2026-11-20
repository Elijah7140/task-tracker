import { lstatSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { Clock, Effect } from "effect";

function alreadyExists(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "EEXIST";
}

/** The two backup pools (§5.2, §7.9). Each keeps its own five newest files. */
type BackupPool = "migration" | "import";

const POOL_PREFIX: Readonly<Record<BackupPool, string>> = {
  migration: "tasktracker-",
  import: "tasktracker-import-",
};

/**
 * Migration backups are `tasktracker-` followed directly by the timestamp. Import backups
 * (`tasktracker-import-…`) and any other files form separate pools that pruning never mixes.
 */
const POOL_NAME: Readonly<Record<BackupPool, RegExp>> = {
  migration: /^tasktracker-\d+\.db\.bak$/,
  import: /^tasktracker-import-\d+\.db\.bak$/,
};

async function reserveBackup(folder: string, time: Temporal.Instant, pool: BackupPool) {
  let instant = time;
  for (;;) {
    const stamp = instant.toString({ fractionalSecondDigits: 7 }).replace(/\D/g, "");
    const destination = join(folder, `${POOL_PREFIX[pool]}${stamp}.db.bak`);
    const staging = `${destination}.tmp`;
    try {
      await mkdir(staging);
    } catch (cause) {
      if (!alreadyExists(cause)) {
        throw cause;
      }
      instant = instant.add({ nanoseconds: 100 });
      continue;
    }
    if (!lstatSync(destination, { throwIfNoEntry: false })) {
      return { destination, staging };
    }
    await rm(staging, { recursive: true });
    instant = instant.add({ nanoseconds: 100 });
  }
}

async function copyDatabase(path: string, time: Temporal.Instant, pool: BackupPool) {
  const folder = dirname(path);
  const { destination, staging } = await reserveBackup(folder, time, pool);
  try {
    const temporary = join(staging, "snapshot.db");
    // The caller keeps its transaction open. A separate, read-only handle copies committed pages.
    using source = new DatabaseSync(path, { readOnly: true });
    await backup(source, temporary);
    await rename(temporary, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return destination;
}

async function pruneBackups(path: string, destination: string, pool: BackupPool) {
  const folder = dirname(path);
  const active = basename(path).toLowerCase();
  // Retain the new copy even if the machine clock moved backwards.
  const saved = basename(destination);
  const olderBackups = (await readdir(folder, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase() !== active &&
        entry.name !== saved &&
        POOL_NAME[pool].test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of olderBackups.slice(4)) {
    await rm(join(folder, name), { force: true });
  }
}

/** Saves the committed database before migration and retains the five newest migration backups. */
export const backupDatabase = Effect.fnUntraced(function* (path: string) {
  const milliseconds = yield* Clock.currentTimeMillis;
  const time = Temporal.Instant.fromEpochMilliseconds(milliseconds);
  // Wait for the native backup before releasing the source and the startup transaction.
  yield* Effect.tryPromise({
    try: async () => pruneBackups(path, await copyDatabase(path, time, "migration"), "migration"),
    catch: (cause) => new Error(`Could not back up the database. ${String(cause)}`, { cause }),
  }).pipe(Effect.uninterruptible);
});

/**
 * Saves the committed database before an import (§7.9) as `tasktracker-import-<stamp>.db.bak`
 * and returns its path. The import pool keeps its five newest files and never removes a
 * migration backup. A failed copy fails; a failed cleanup of old copies is only logged.
 */
export const backupDatabaseForImport = Effect.fnUntraced(function* (path: string) {
  const milliseconds = yield* Clock.currentTimeMillis;
  const time = Temporal.Instant.fromEpochMilliseconds(milliseconds);
  const destination = yield* Effect.tryPromise({
    try: () => copyDatabase(path, time, "import"),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(Effect.uninterruptible);
  yield* Effect.tryPromise(() => pruneBackups(path, destination, "import")).pipe(
    Effect.catch((cause) => Effect.logWarning("Could not remove an old import backup", cause)),
  );
  return destination;
});
