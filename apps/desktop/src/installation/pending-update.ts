import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Option, Schema } from "effect";

/** A downloaded and verified update that has not been installed yet (§7.13). */
const PendingUpdateSchema = Schema.Struct({
  version: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  fileName: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)),
  sha512: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9+/]{86}==$/)),
  size: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** The record of a verified download, kept beside the file in the updater's folder. */
export type PendingUpdate = typeof PendingUpdateSchema.Type;

const RECORD = "pending-update.json";

const decodeRecord = Schema.decodeUnknownOption(Schema.fromJsonString(PendingUpdateSchema));
const encodeRecord = Schema.encodeSync(Schema.fromJsonString(PendingUpdateSchema));

/** Records a verified download. The record is written last, so a partial download has none. */
export function writePendingUpdate(directory: string, pending: PendingUpdate) {
  return writeFile(join(directory, RECORD), encodeRecord(pending), { mode: 0o600 });
}

/** The recorded download, or undefined when there is none or the record is invalid. */
export async function readPendingUpdate(directory: string): Promise<PendingUpdate | undefined> {
  try {
    return Option.getOrUndefined(decodeRecord(await readFile(join(directory, RECORD), "utf8")));
  } catch {
    return undefined;
  }
}

/** Forgets the record, so the download is offered or installed at most once. */
export function forgetPendingUpdate(directory: string) {
  return rm(join(directory, RECORD), { force: true });
}

/**
 * Deletes the updater's own folder and everything in it. A symbolic link in its
 * place is removed without following it.
 */
export function clearUpdateDirectory(directory: string) {
  return rm(directory, { recursive: true, force: true });
}
