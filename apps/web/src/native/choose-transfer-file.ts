import { TransferFileChoice, type TransferFileRequest } from "@task-tracker/contracts";
import { Option, Schema } from "effect";
import type { DesktopBridge } from "../rpc/rpc-connection-source.js";
import { notify } from "../state/dialog-store.js";
import { TRANSFER_TITLE } from "../transfer/transfer-messages.js";

/** Shown in a plain browser, where no native file dialog exists. */
export const DESKTOP_REQUIRED_MESSAGE = "Import and export needs the desktop app.";

/** Shown when the native dialog fails without a message of its own. */
export const FILE_DIALOG_FAILURE_MESSAGE = "The file dialog could not be opened.";

const decodeChoice = Schema.decodeUnknownOption(TransferFileChoice);

/** The renderer's view of a chosen file: its one-time token and its name for messages. */
export type TransferFile = typeof TransferFileChoice.Type;

const failureMessage = (error: unknown) =>
  error instanceof Error && error.message !== "" ? error.message : FILE_DIALOG_FAILURE_MESSAGE;

async function askDesktop(
  choose: NonNullable<DesktopBridge["chooseTransferFile"]>,
  request: typeof TransferFileRequest.Type,
): Promise<TransferFile | null> {
  const answer = await choose(request);
  if (answer === null) {
    return null;
  }
  const choice = decodeChoice(answer);
  if (Option.isNone(choice)) {
    throw new Error(FILE_DIALOG_FAILURE_MESSAGE);
  }
  return choice.value;
}

/**
 * Asks the desktop shell for a file to export to or import from. Resolves with
 * null when the user cancels. Without the desktop bridge, or when the dialog
 * fails, it explains why in a notice and also resolves with null.
 */
export async function chooseTransferFile(
  request: typeof TransferFileRequest.Type,
): Promise<TransferFile | null> {
  const choose = window.taskTrackerDesktop?.chooseTransferFile;
  if (choose === undefined) {
    await notify({ title: TRANSFER_TITLE, message: DESKTOP_REQUIRED_MESSAGE });
    return null;
  }
  try {
    return await askDesktop(choose, request);
  } catch (error) {
    await notify({ title: TRANSFER_TITLE, message: failureMessage(error) });
    return null;
  }
}
