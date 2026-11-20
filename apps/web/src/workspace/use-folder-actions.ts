import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import type { Exit } from "effect";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { reportFailure } from "../dialogs/report-failure.js";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import {
  createFolderAtom,
  deleteFolderAtom,
  moveFolderAtom,
  renameFolderAtom,
} from "../rpc/folder-mutations.js";
import { PROJECTS_KEY, projectKey } from "../rpc/project-queries.js";
import { choose, confirm, prompt } from "../state/dialog-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { areaTarget, useCurrentArea } from "./area-route.js";
import {
  buildFolderForest,
  flattenFolderForest,
  type Folder,
  isWithinFolder,
} from "./folder-outline.js";

/** The project a folder action runs in. */
export interface FolderActionScope {
  readonly projectId: string;
  readonly projectName: string;
  readonly folders: ReadonlyArray<Folder>;
}

/** Choice value for the project root in the move dialog. */
const ROOT_CHOICE = "root";

/** Shows a failed folder action and reports whether it succeeded. */
const reportFolderFailure = (exit: Exit.Exit<unknown, RpcFailure>) =>
  reportFailure("Folder action failed", exit);

function useCreateFolder({ projectId }: FolderActionScope) {
  const create = useAtomSet(createFolderAtom, { mode: "promiseExit" });
  const setFolderExpanded = useWorkspaceStore((state) => state.setFolderExpanded);
  return async (parentFolderId: string | null) => {
    const name = await prompt({
      title: "New folder",
      label: "Folder name",
      confirmLabel: "Create",
      validation: NAME_VALIDATION,
    });
    if (name === null) {
      return;
    }
    if (parentFolderId !== null) {
      setFolderExpanded(parentFolderId, true);
    }
    const payload = { projectId, parentFolderId, name };
    await reportFolderFailure(
      await create({ payload, reactivityKeys: [HISTORY_KEY, projectKey(projectId)] }),
    );
  };
}

function useRenameFolder({ projectId }: FolderActionScope) {
  const rename = useAtomSet(renameFolderAtom, { mode: "promiseExit" });
  return async (folder: Folder) => {
    const name = await prompt({
      title: "Rename folder",
      label: "Folder name",
      initialValue: folder.name,
      confirmLabel: "Rename",
      validation: NAME_VALIDATION,
    });
    if (name !== null) {
      const payload = { projectId, folderId: folder.id, name };
      await reportFolderFailure(
        await rename({ payload, reactivityKeys: [HISTORY_KEY, projectKey(projectId)] }),
      );
    }
  };
}

function moveChoices({ projectName, folders }: FolderActionScope) {
  const nested = flattenFolderForest(buildFolderForest(folders)).map(({ folder, depth }) => ({
    value: folder.id,
    label: folder.name,
    depth: depth + 1,
  }));
  return [{ value: ROOT_CHOICE, label: projectName }, ...nested];
}

function useMoveFolder(scope: FolderActionScope) {
  const move = useAtomSet(moveFolderAtom, { mode: "promiseExit" });
  return async (folder: Folder) => {
    const currentParent = folder.parentFolderId ?? ROOT_CHOICE;
    const choice = await choose({
      title: `Move ${folder.name}`,
      label: "Destination",
      options: moveChoices(scope),
      initialValue: currentParent,
      confirmLabel: "Move",
    });
    if (choice === null || choice === currentParent) {
      return;
    }
    const payload = {
      projectId: scope.projectId,
      folderId: folder.id,
      parentFolderId: choice === ROOT_CHOICE ? null : choice,
    };
    await reportFolderFailure(
      await move({ payload, reactivityKeys: [HISTORY_KEY, projectKey(scope.projectId)] }),
    );
  };
}

function useDeleteFolder({ projectId, folders }: FolderActionScope) {
  const remove = useAtomSet(deleteFolderAtom, { mode: "promiseExit" });
  const navigate = useNavigate();
  const { folderId: currentFolderId } = useCurrentArea();
  return async (folder: Folder) => {
    const confirmed = await confirm({
      title: "Delete folder",
      message: `Delete ${folder.name} and its contents?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    const leavesArea =
      currentFolderId !== null && isWithinFolder(folders, currentFolderId, folder.id);
    const payload = { projectId, folderId: folder.id };
    const deleted = await reportFolderFailure(
      await remove({ payload, reactivityKeys: [PROJECTS_KEY, HISTORY_KEY] }),
    );
    if (deleted && leavesArea) {
      await navigate(areaTarget(projectId, folder.parentFolderId));
    }
  };
}

/**
 * Folder create, rename, move and delete flows (the legacy FolderTreeViewModel
 * commands). Each asks through the shared dialogs, sends one RPC and refreshes
 * the workspace. Deleting the open folder, or one above it, opens its parent.
 * A rejected action shows the server's message.
 */
export function useFolderActions(scope: FolderActionScope) {
  return {
    createFolder: useCreateFolder(scope),
    renameFolder: useRenameFolder(scope),
    moveFolder: useMoveFolder(scope),
    deleteFolder: useDeleteFolder(scope),
  };
}

/** The flows returned by {@link useFolderActions}. */
export type FolderActions = ReturnType<typeof useFolderActions>;
