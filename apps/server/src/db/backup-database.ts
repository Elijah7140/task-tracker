import { lstatSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { Clock, Effect } from "effect";

function alreadyExists(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "EEXIST";
}

async function reserveBackup(folder: string, time: Temporal.Instant) {
  let instant = time;
  for (;;) {
    const stamp = instant.toString({ fractionalSecondDigits: 7 }).replace(/\D/g, "");
    const destination = join(folder, `tasktracker-${stamp}.db.bak`);
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

async function copyDatabase(path: string, time: Temporal.Instant) {
  const folder = dirname(path);
  const { destination, staging } = await reserveBackup(folder, time);
  try {
    const temporary = join(staging, "snapshot.db");
    // Startup holds the writer reservation. A separate, read-only handle copies committed pages.
    using source = new DatabaseSync(path, { readOnly: true });
    await backup(source, temporary);
    await rename(temporary, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  await pruneBackups(path, destination);
}

async function pruneBackups(path: string, destination: string) {
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
        /^tasktracker-.*\.db\.bak$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of olderBackups.slice(4)) {
    await rm(join(folder, name), { force: true });
  }
}

/** Saves the committed database before migration and retains the five newest backups. */
export const backupDatabase = Effect.fnUntraced(function* (path: string) {
  const milliseconds = yield* Clock.currentTimeMillis;
  const time = Temporal.Instant.fromEpochMilliseconds(milliseconds);
  // Wait for the native backup before releasing the source and the startup transaction.
  yield* Effect.tryPromise({
    try: () => copyDatabase(path, time),
    catch: (cause) => new Error(`Could not back up the database. ${String(cause)}`, { cause }),
  }).pipe(Effect.uninterruptible);
});
