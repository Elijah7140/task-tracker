import { Schema } from "effect";
import { Guid } from "./guid.js";
import { NotFound, OperationFailed, RuleViolation } from "./rpc-operation-error.js";

/**
 * A one-time reference to a file the user chose in the desktop file dialog. Electron
 * main hands the chosen path to the server privately; the renderer only sees this token.
 */
export const TransferFileToken = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));

/** What a file dialog is for. Each purpose fixes the dialog kind and the `.json` filter. */
export const TransferFilePurpose = Schema.Literals(["export-json", "import-json"]);

/** A renderer request for a file dialog. The suggested name only seeds a save dialog. */
export const TransferFileRequest = Schema.Struct({
  purpose: TransferFilePurpose,
  suggestedName: Schema.optional(Schema.String.check(Schema.isMaxLength(255))),
});

/** The renderer's view of a chosen file: its token and its file name for messages. */
export const TransferFileChoice = Schema.Struct({
  token: TransferFileToken,
  fileName: Schema.String,
});

/**
 * The private message Electron main writes to the server's stdin after a dialog:
 * the token now stands for `path`, for reading (import) or writing (export).
 */
export const TransferFileGrant = Schema.Struct({
  type: Schema.Literal("transfer-file-grant"),
  token: TransferFileToken,
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
  access: Schema.Literals(["read", "write"]),
});

/** One problem in an import file, located by a JSON path. */
export const TransferIssue = Schema.Struct({ path: Schema.String, message: Schema.String });

/** How much an import file holds or an import created. */
export const TransferSummary = Schema.Struct({
  projects: Schema.Int,
  folders: Schema.Int,
  items: Schema.Int,
  savedSearches: Schema.Int,
});

/** What a JSON export covers: the whole database or one project (§7.9). */
export const JsonExportScope = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("all") }),
  Schema.Struct({ kind: Schema.Literal("project"), projectId: Guid }),
]);

/** A finished export and the path it was written to. */
export const JsonExportResult = Schema.Struct({ path: Schema.String });

/** A checked import file. It can be imported when `issues` is empty. */
export const JsonImportPreview = Schema.Struct({
  fileName: Schema.String,
  summary: TransferSummary,
  issues: Schema.Array(TransferIssue),
});

/** The outcome of an import: what was created and the backup taken, or why nothing changed. */
export const JsonImportResult = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("imported"),
    summary: TransferSummary,
    backupPath: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("refused"), issues: Schema.Array(TransferIssue) }),
]);

/**
 * A file could not be chosen, read or written, or the pre-import backup failed. The
 * message is meant for the user; nothing was imported.
 */
export class TransferFailed extends Schema.TaggedError<TransferFailed>()("TransferFailed", {
  message: Schema.String,
}) {}

/** Failures returned by the transfer RPCs. */
export const TransferError = Schema.Union([
  RuleViolation,
  NotFound,
  OperationFailed,
  TransferFailed,
]);
