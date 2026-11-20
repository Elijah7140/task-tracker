import { useAtomSet } from "@effect/atom-react";
import type { JsonImportPreview, JsonImportResult, ProjectSummary } from "@task-tracker/contracts";
import { Exit } from "effect";
import { chooseTransferFile } from "../native/choose-transfer-file.js";
import {
  exportJsonAtom,
  IMPORT_REACTIVITY_KEYS,
  importJsonAtom,
  listProjectsForExportAtom,
  previewJsonImportAtom,
} from "../rpc/transfer-queries.js";
import { choose, confirm, notify } from "../state/dialog-store.js";
import {
  beginTransfer,
  endTransfer,
  setTransferWorking,
  showTransferStatus,
  useTransferStore,
} from "../state/transfer-store.js";
import { describeTransferFailure, type TransferFailure } from "./describe-transfer-failure.js";
import {
  describeTransferIssues,
  describeTransferSummary,
  importConfirmationMessage,
  projectExportFileName,
  TRANSFER_TITLE,
} from "./transfer-messages.js";

/** The file name an Export everything save dialog suggests. */
export const ALL_EXPORT_FILE_NAME = "task-tracker-export.json";

/** The title of the notice that lists an import file's problems. */
export const INVALID_IMPORT_TITLE = "This file can't be imported";

/** The title of the notice shown when the server refuses a checked import. */
export const REFUSED_IMPORT_TITLE = "The import was stopped; nothing was changed";

const EXPORT_PROJECT_TITLE = "Export project";

type Summary = typeof ProjectSummary.Type;

/** Runs `flow` unless another transfer runs, and always ends the busy state. */
async function exclusively(flow: () => Promise<void>) {
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
 * or with undefined after a notice explains the failure.
 */
async function callTransfer<A>(
  request: () => Promise<Exit.Exit<A, TransferFailure>>,
): Promise<A | undefined> {
  setTransferWorking(true);
  const exit = await request().finally(() => setTransferWorking(false));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  await notify({ title: TRANSFER_TITLE, message: describeTransferFailure(exit.cause) });
  return undefined;
}

function useExportEverything() {
  const exportJson = useAtomSet(exportJsonAtom, { mode: "promiseExit" });
  return async () => {
    const file = await chooseTransferFile({
      purpose: "export-json",
      suggestedName: ALL_EXPORT_FILE_NAME,
    });
    if (file === null) {
      return;
    }
    const result = await callTransfer(() =>
      exportJson({ payload: { scope: { kind: "all" }, fileToken: file.token } }),
    );
    if (result !== undefined) {
      showTransferStatus(`Exported everything to ${result.path}.`);
    }
  };
}

/** Asks which project to export, in list order. Undefined when there is none or the user cancels. */
async function chooseExportProject(summaries: ReadonlyArray<Summary>) {
  if (summaries.length === 0) {
    await notify({ title: EXPORT_PROJECT_TITLE, message: "There are no projects yet." });
    return undefined;
  }
  const projectId = await choose({
    title: EXPORT_PROJECT_TITLE,
    label: "Project",
    options: summaries.map(({ project }) => ({ value: project.id, label: project.name })),
    confirmLabel: "Export",
  });
  return summaries.find(({ project }) => project.id === projectId)?.project;
}

function useExportProject() {
  const listProjects = useAtomSet(listProjectsForExportAtom, { mode: "promiseExit" });
  const exportJson = useAtomSet(exportJsonAtom, { mode: "promiseExit" });
  return async () => {
    const summaries = await callTransfer(() => listProjects({ payload: undefined }));
    const project = summaries === undefined ? undefined : await chooseExportProject(summaries);
    if (project === undefined) {
      return;
    }
    const file = await chooseTransferFile({
      purpose: "export-json",
      suggestedName: projectExportFileName(project.name),
    });
    if (file === null) {
      return;
    }
    const scope = { kind: "project", projectId: project.id } as const;
    const result = await callTransfer(() =>
      exportJson({ payload: { scope, fileToken: file.token } }),
    );
    if (result !== undefined) {
      showTransferStatus(`Exported ${project.name} to ${result.path}.`);
    }
  };
}

/** Reports a finished import: a status line with the backup path, or why the server refused it. */
async function reportImport(result: typeof JsonImportResult.Type) {
  if (result.kind === "refused") {
    await notify({ title: REFUSED_IMPORT_TITLE, message: describeTransferIssues(result.issues) });
    return;
  }
  showTransferStatus(
    `Imported ${describeTransferSummary(result.summary)}. A backup was saved to ${result.backupPath}.`,
  );
}

/** Lists a checked file's problems, or asks whether to import it. True means import. */
async function confirmImport(preview: typeof JsonImportPreview.Type): Promise<boolean> {
  if (preview.issues.length > 0) {
    await notify({ title: INVALID_IMPORT_TITLE, message: describeTransferIssues(preview.issues) });
    return false;
  }
  return confirm({
    title: "Import data",
    message: importConfirmationMessage(preview.summary, preview.fileName),
    confirmLabel: "Import",
  });
}

function useImportJson() {
  const preview = useAtomSet(previewJsonImportAtom, { mode: "promiseExit" });
  const importJson = useAtomSet(importJsonAtom, { mode: "promiseExit" });
  return async () => {
    const file = await chooseTransferFile({ purpose: "import-json" });
    if (file === null) {
      return;
    }
    const checked = await callTransfer(() => preview({ payload: { fileToken: file.token } }));
    if (checked === undefined || !(await confirmImport(checked))) {
      return;
    }
    const result = await callTransfer(() =>
      importJson({ payload: { fileToken: file.token }, reactivityKeys: IMPORT_REACTIVITY_KEYS }),
    );
    if (result !== undefined) {
      await reportImport(result);
    }
  };
}

/**
 * JSON import and export flows (the legacy DataTransferViewModel, §7.9). Each
 * flow asks for a file through the desktop shell, sends the transfer RPCs and
 * reports the outcome as a Home status line or a notice. Only one flow runs at
 * a time; `running` is true from the first dialog until the flow ends, so menus
 * can disable their transfer commands.
 */
export function useDataTransfer() {
  const running = useTransferStore((state) => state.running);
  const exportEverything = useExportEverything();
  const exportProject = useExportProject();
  const importJson = useImportJson();
  return {
    running,
    exportEverything: () => exclusively(exportEverything),
    exportProject: () => exclusively(exportProject),
    importJson: () => exclusively(importJson),
  };
}
