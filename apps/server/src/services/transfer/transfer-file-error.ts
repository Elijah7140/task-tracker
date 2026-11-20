/**
 * A transfer file could not be chosen, read or written, or the pre-import backup
 * failed. The message is shown to the user as it is; nothing was imported.
 */
export class TransferFileError extends Error {
  override readonly name = "TransferFileError";
}
