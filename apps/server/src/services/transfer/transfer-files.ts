import { randomBytes } from "node:crypto";
import { open, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { Effect } from "effect";
import { TransferFileError } from "./transfer-file-error.js";

/** The largest file an import reads (§7.9). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

const MEGABYTE = 1024 * 1024;

function errorCode(cause: unknown): string | undefined {
  return cause instanceof Error && "code" in cause ? String(cause.code) : undefined;
}

/** The legacy .NET wording for the common file errors. */
function describeFileError(cause: unknown, path: string, writing: boolean): string {
  switch (errorCode(cause)) {
    case "ENOENT":
      return writing
        ? `Could not find a part of the path '${path}'.`
        : `Could not find file '${path}'.`;
    case "EACCES":
    case "EPERM":
      return `Access to the path '${path}' is denied.`;
    case "EISDIR":
      return `Access to the path '${path}' is denied.`;
    default:
      return cause instanceof Error ? cause.message : String(cause);
  }
}

async function readBytes(path: string): Promise<Uint8Array> {
  const info = await stat(path);
  if (!info.isFile()) {
    throw Object.assign(new Error("Not a file."), { code: "EISDIR" });
  }
  if (info.size > MAX_IMPORT_BYTES) {
    const megabytes = Math.ceil(info.size / MEGABYTE);
    throw new TransferFileError(
      `This file is ${megabytes} MB; the largest file that can be imported is ${MAX_IMPORT_BYTES / MEGABYTE} MB.`,
    );
  }
  await using handle = await open(path, "r");
  return new Uint8Array(await handle.readFile());
}

/** The two transfer file formats; each has its own encoding rules and messages (§7.9). */
export type TransferFileKind = "json" | "csv";

const NOT_UTF8: Record<TransferFileKind, string> = {
  json: "This file isn't UTF-8. Re-save it as UTF-8 text and try again.",
  csv: "This file isn't UTF-8. Re-save it as 'CSV UTF-8' and try again.",
};

function decodeUtf8(bytes: Uint8Array, kind: TransferFileKind): string {
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start));
  } catch {
    throw new TransferFileError(NOT_UTF8[kind]);
  }
}

/**
 * Reads an import file as strict UTF-8 (a byte order mark is removed). Files over
 * 50 MB are refused before they are read; another encoding is refused with advice
 * for the file's kind.
 */
export const readTransferFile = (path: string, kind: TransferFileKind) =>
  Effect.tryPromise({
    try: async () => decodeUtf8(await readBytes(path), kind),
    catch: (cause) =>
      cause instanceof TransferFileError
        ? cause
        : new TransferFileError(describeFileError(cause, path, false)),
  });

/**
 * Writes export text as UTF-8: CSV with a byte order mark so Excel detects the
 * encoding, JSON without. The text goes to a hidden file beside the target first
 * and replaces it in one rename, so a failed write never leaves a half-written export.
 */
export const writeTransferFile = (path: string, text: string, kind: TransferFileKind) =>
  Effect.tryPromise({
    try: async () => {
      const staging = `${path}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        const content = kind === "csv" ? `\uFEFF${text}` : text;
        await writeFile(staging, content, { encoding: "utf8", flag: "wx" });
        await rename(staging, path);
      } finally {
        await rm(staging, { force: true });
      }
    },
    catch: (cause) => new TransferFileError(describeFileError(cause, path, true)),
  });

/** The file name shown in messages. */
export const transferFileName = (path: string) => basename(path);
