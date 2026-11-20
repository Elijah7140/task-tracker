import type { JsonImportResult, ProjectSummary } from "@task-tracker/contracts";
import { Exit } from "effect";
import { choose, notify } from "../state/dialog-store.js";
import {
  beginTransfer,
  endTransfer,
  setTransferWorking,
  showTransferStatus,
} from "../state/transfer-store.js";
import { describeTransferFailure, type TransferFailure } from "./describe-transfer-failure.js";
import {
  describeTransferIssues,
  describeTransferSummary,
  TRANSFER_TITLE,
} from "./transfer-messages.js";

/** The title of the notice shown when the server refuses a checked import. */
export const REFUSED_IMPORT_TITLE = "The import was stopped; nothing was changed";

type Summary = typeof ProjectSummary.Type;

/** Runs `flow` unless another transfer runs, and always ends the busy state. */
export async function exclusively(flow: () => Promise<void>) {
  if (!beginTransfer()) {
    return;
  }
  try {
    await flow();
  } finally {
    endTransfer();
  }
}

/**
 * Sends one transfer RPC with the progress bar showing. Resolves with its value,
 * or with undefined after a notice titled `failureTitle` explains the failure.
 */
export async function callTransfer<A>(
  request: () => Promise<Exit.Exit<A, TransferFailure>>,
  failureTitle = TRANSFER_TITLE,
): Promise<A | undefined> {
  setTransferWorking(true);
  const exit = await request().finally(() => setTransferWorking(false));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  await notify({ title: failureTitle, message: describeTransferFailure(exit.cause) });
  return undefined;
}

/** How a project choice reads: its dialog title and confirm button. */
export interface ProjectChoice {
  readonly title: string;
  readonly confirmLabel: string;
}

/** Asks which project to use, in list order. Undefined when there is none or the user cancels. */
export async function chooseProject(summaries: ReadonlyArray<Summary>, choice: ProjectChoice) {
  if (summaries.length === 0) {
    await notify({ title: choice.title, message: "There are no projects yet." });
    return undefined;
  }
  const projectId = await choose({
    title: choice.title,
    label: "Project",
    options: summaries.map(({ project }) => ({ value: project.id, label: project.name })),
    confirmLabel: choice.confirmLabel,
  });
  return summaries.find(({ project }) => project.id === projectId)?.project;
}

/** Reports a finished import: a status line with the backup path, or why the server refused it. */
export async function reportImport(result: typeof JsonImportResult.Type) {
  if (result.kind === "refused") {
    await notify({ title: REFUSED_IMPORT_TITLE, message: describeTransferIssues(result.issues) });
    return;
  }
  showTransferStatus(
    `Imported ${describeTransferSummary(result.summary)}. A backup was saved to ${result.backupPath}.`,
  );
}
