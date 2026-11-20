import { useAtomSet } from "@effect/atom-react";
import type { CsvImportTarget, ProjectProjection } from "@task-tracker/contracts";
import { chooseTransferFile } from "../native/choose-transfer-file.js";
import {
  IMPORT_REACTIVITY_KEYS,
  importCsvAtom,
  listProjectsForExportAtom,
  loadWorkspaceForImportAtom,
  previewCsvImportAtom,
} from "../rpc/transfer-queries.js";
import { choose, previewCsv } from "../state/dialog-store.js";
import {
  buildFolderForest,
  flattenFolderForest,
  type Folder,
} from "../workspace/folder-outline.js";
import { callTransfer, chooseProject, reportImport } from "./transfer-flow.js";

const IMPORT_CSV = { title: "Import CSV into project", confirmLabel: "Next" } as const;

/** The folder choice value that stands for the project root. */
export const PROJECT_ROOT_CHOICE = "project-root";

type Project = typeof ProjectProjection.Type;

/** A chosen import target and how the preview names it. */
interface ChosenTarget {
  readonly target: typeof CsvImportTarget.Type;
  readonly name: string;
}

/** The project root and every folder, indented, as the legacy folder list shows them. */
function folderChoices(folders: ReadonlyArray<Folder>) {
  const nested = flattenFolderForest(buildFolderForest(folders)).map(({ folder, depth }) => ({
    value: folder.id,
    label: folder.name,
    depth: depth + 1,
  }));
  return [{ value: PROJECT_ROOT_CHOICE, label: "Project root" }, ...nested];
}

/**
 * Asks which folder to import into. A project without folders imports into its
 * root without asking; cancelling resolves with undefined.
 */
async function chooseFolder(project: Project, folders: ReadonlyArray<Folder>) {
  if (folders.length === 0) {
    return { target: { projectId: project.id, folderId: null }, name: project.name };
  }
  const chosen = await choose({
    title: `Import into ${project.name}`,
    label: "Import into",
    options: folderChoices(folders),
    confirmLabel: "Next",
  });
  if (chosen === null) {
    return undefined;
  }
  const folder = folders.find((candidate) => candidate.id === chosen);
  const name = folder === undefined ? project.name : `${project.name} / ${folder.name}`;
  return { target: { projectId: project.id, folderId: folder?.id ?? null }, name };
}

/** Asks for the project and, when it has folders, the folder a CSV import fills. */
function useChooseTarget() {
  const listProjects = useAtomSet(listProjectsForExportAtom, { mode: "promiseExit" });
  const loadWorkspace = useAtomSet(loadWorkspaceForImportAtom, { mode: "promiseExit" });
  return async (): Promise<ChosenTarget | undefined> => {
    const summaries = await callTransfer(() => listProjects({ payload: undefined }));
    const project =
      summaries === undefined ? undefined : await chooseProject(summaries, IMPORT_CSV);
    if (project === undefined) {
      return undefined;
    }
    const workspace = await callTransfer(() =>
      loadWorkspace({ payload: { projectId: project.id } }),
    );
    return workspace === undefined ? undefined : chooseFolder(project, workspace.folders);
  };
}

/**
 * Imports a CSV file into a project (§7.9): choose the project, then a folder
 * when it has folders, then the file. The preview lists every problem and
 * offers Import only for a file without problems; the server re-checks the
 * file and adds its rows after a backup.
 */
export function useImportCsv() {
  const chooseTarget = useChooseTarget();
  const preview = useAtomSet(previewCsvImportAtom, { mode: "promiseExit" });
  const importCsv = useAtomSet(importCsvAtom, { mode: "promiseExit" });
  return async () => {
    const chosen = await chooseTarget();
    const file = chosen === undefined ? null : await chooseTransferFile({ purpose: "import-csv" });
    if (chosen === undefined || file === null) {
      return;
    }
    const payload = { fileToken: file.token, target: chosen.target };
    const checked = await callTransfer(() => preview({ payload }));
    if (checked === undefined) {
      return;
    }
    const accepted = await previewCsv({
      title: "Import CSV",
      preview: checked,
      targetName: chosen.name,
    });
    if (!accepted || !checked.canImport) {
      return;
    }
    const result = await callTransfer(() =>
      importCsv({ payload, reactivityKeys: IMPORT_REACTIVITY_KEYS }),
    );
    if (result !== undefined) {
      await reportImport(result);
    }
  };
}
