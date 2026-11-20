import { useAtomSet } from "@effect/atom-react";
import type { JsonImportPreview } from "@task-tracker/contracts";
import { chooseTransferFile } from "../native/choose-transfer-file.js";
import {
  exportJsonAtom,
  exportProjectCsvAtom,
  IMPORT_REACTIVITY_KEYS,
  importJsonAtom,
  listProjectsForExportAtom,
  previewJsonImportAtom,
} from "../rpc/transfer-queries.js";
import { confirm, notify } from "../state/dialog-store.js";
import { showTransferStatus, useTransferStore } from "../state/transfer-store.js";
import { callTransfer, chooseProject, exclusively, reportImport } from "./transfer-flow.js";
import {
  describeTransferIssues,
  importConfirmationMessage,
  projectExportFileName,
} from "./transfer-messages.js";
import { useImportCsv } from "./use-import-csv.js";

export { REFUSED_IMPORT_TITLE } from "./transfer-flow.js";

/** The file name an Export everything save dialog suggests. */
export const ALL_EXPORT_FILE_NAME = "task-tracker-export.json";

/** The title of the notice that lists an import file's problems. */
export const INVALID_IMPORT_TITLE = "This file can't be imported";

const EXPORT_PROJECT = { title: "Export project", confirmLabel: "Export" } as const;

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

/**
 * Exports one project chosen from the list: as JSON, everything it holds; as
 * CSV, its items in screen order (§7.9).
 */
function useExportProject(kind: "json" | "csv") {
  const listProjects = useAtomSet(listProjectsForExportAtom, { mode: "promiseExit" });
  const exportJson = useAtomSet(exportJsonAtom, { mode: "promiseExit" });
  const exportCsv = useAtomSet(exportProjectCsvAtom, { mode: "promiseExit" });
  return async () => {
    const summaries = await callTransfer(() => listProjects({ payload: undefined }));
    const project =
      summaries === undefined ? undefined : await chooseProject(summaries, EXPORT_PROJECT);
    if (project === undefined) {
      return;
    }
    const file = await chooseTransferFile({
      purpose: kind === "csv" ? "export-csv" : "export-json",
      suggestedName: projectExportFileName(project.name, kind),
    });
    if (file === null) {
      return;
    }
    const fileToken = file.token;
    const scope = { kind: "project", projectId: project.id } as const;
    const result = await callTransfer(() =>
      kind === "csv"
        ? exportCsv({ payload: { projectId: project.id, fileToken } })
        : exportJson({ payload: { scope, fileToken } }),
    );
    if (result !== undefined) {
      showTransferStatus(`Exported ${project.name} to ${result.path}.`);
    }
  };
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
 * JSON and CSV import and export flows (the legacy DataTransferViewModel,
 * §7.9). Each flow asks for a file through the desktop shell, sends the
 * transfer RPCs and reports the outcome as a Home status line or a notice.
 * Only one flow runs at a time; `running` is true from the first dialog until
 * the flow ends, so menus can disable their transfer commands.
 */
export function useDataTransfer() {
  const running = useTransferStore((state) => state.running);
  const exportEverything = useExportEverything();
  const exportProject = useExportProject("json");
  const exportProjectCsv = useExportProject("csv");
  const importJson = useImportJson();
  const importCsv = useImportCsv();
  return {
    running,
    exportEverything: () => exclusively(exportEverything),
    exportProject: () => exclusively(exportProject),
    exportProjectCsv: () => exclusively(exportProjectCsv),
    importJson: () => exclusively(importJson),
    importCsv: () => exclusively(importCsv),
  };
}
