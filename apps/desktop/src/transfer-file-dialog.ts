import { randomBytes } from "node:crypto";
import { basename, isAbsolute } from "node:path";
import { TransferFileRequest } from "@task-tracker/contracts";
import { Option, Schema } from "effect";

/** A validated renderer request for a transfer file dialog. */
export type TransferRequest = typeof TransferFileRequest.Type;

/** The grant main sends the server for a chosen file. */
export interface TransferGrant {
  readonly type: "transfer-file-grant";
  readonly token: string;
  readonly path: string;
  readonly access: "read" | "write";
}

const decodeRequest = Schema.decodeUnknownOption(TransferFileRequest);

/** Decodes a renderer request, or undefined for anything else. */
export function parseTransferRequest(value: unknown): TransferRequest | undefined {
  return Option.getOrUndefined(decodeRequest(value));
}

/** A suggested file name: no folders, no characters file systems reject, ending in `.json`. */
export function suggestedFileName(name: string | undefined): string {
  const cleaned = (name ?? "")
    // oxlint-disable-next-line no-control-regex -- control characters are invalid in file names
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .trim()
    .replace(/^\.+/, "");
  const base = cleaned === "" ? "task-tracker-export" : cleaned;
  return /\.json$/i.test(base) ? base : `${base}.json`;
}

/**
 * The path a dialog returned, checked before the server may use it: absolute and
 * named `.json`. A save without the extension gets it; anything else is refused.
 */
export function checkedTransferPath(path: string | undefined, saving: boolean): string | undefined {
  if (path === undefined || path === "" || !isAbsolute(path) || path.includes("\0")) {
    return undefined;
  }
  if (/\.json$/i.test(path)) {
    return path;
  }
  return saving ? `${path}.json` : undefined;
}

/** A fresh grant for a checked path; the renderer only ever sees the token and file name. */
export function grantFor(path: string, request: TransferRequest): TransferGrant {
  return {
    type: "transfer-file-grant",
    token: randomBytes(32).toString("base64url"),
    path,
    access: request.purpose === "export-json" ? "write" : "read",
  };
}

/** What the renderer receives for a chosen file. */
export function choiceFor(grant: TransferGrant) {
  return { token: grant.token, fileName: basename(grant.path) };
}

/**
 * The fixed path end-to-end tests use instead of a native dialog. It applies only
 * when both `TASKTRACKER_SMOKE=1` and `TASKTRACKER_TEST_FILE_PATH` are set (§7.9).
 */
export function testFilePath(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const path = environment.TASKTRACKER_TEST_FILE_PATH;
  return environment.TASKTRACKER_SMOKE === "1" && path ? path : undefined;
}
