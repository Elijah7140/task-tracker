import type { FolderProjection } from "@task-tracker/contracts";
import type { ChoiceOption } from "../state/dialog-store.js";

/** Choice value representing the project root area in destination pickers. */
export const ROOT_AREA_CHOICE = "root";

/** An active folder as the workspace snapshot returns it. */
export type Folder = typeof FolderProjection.Type;

/** A folder with its sub-folders in sibling order. */
export interface FolderNode {
  readonly folder: Folder;
  readonly depth: number;
  readonly children: ReadonlyArray<FolderNode>;
}

function childrenByParent(folders: ReadonlyArray<Folder>) {
  const groups = new Map<string | null, Array<Folder>>();
  for (const folder of folders) {
    const siblings = groups.get(folder.parentFolderId) ?? [];
    siblings.push(folder);
    groups.set(folder.parentFolderId, siblings);
  }
  for (const siblings of groups.values()) {
    siblings.sort((left, right) => left.sortOrder - right.sortOrder);
  }
  return groups;
}

/**
 * Arranges the snapshot's flat folder list into trees under the project root.
 * Siblings follow the server's sort order.
 */
export function buildFolderForest(folders: ReadonlyArray<Folder>): ReadonlyArray<FolderNode> {
  const groups = childrenByParent(folders);
  const build = (parentId: string | null, depth: number): ReadonlyArray<FolderNode> =>
    (groups.get(parentId) ?? []).map((folder) => ({
      folder,
      depth,
      children: build(folder.id, depth + 1),
    }));
  return build(null, 0);
}

/** Every folder in depth-first display order with its depth, for pickers. */
export function flattenFolderForest(forest: ReadonlyArray<FolderNode>): ReadonlyArray<FolderNode> {
  return forest.flatMap((node) => [node, ...flattenFolderForest(node.children)]);
}

/**
 * The folders from the top level down to `folderId`, for breadcrumbs. Empty
 * when the folder is not in the snapshot.
 */
export function folderPath(
  folders: ReadonlyArray<Folder>,
  folderId: string,
): ReadonlyArray<Folder> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: Array<Folder> = [];
  for (let current = byId.get(folderId); current !== undefined;) {
    path.unshift(current);
    current = current.parentFolderId === null ? undefined : byId.get(current.parentFolderId);
  }
  return path;
}

/** Whether `folderId` is `ancestorId` or lies beneath it. */
export function isWithinFolder(
  folders: ReadonlyArray<Folder>,
  folderId: string,
  ancestorId: string,
): boolean {
  return folderPath(folders, folderId).some((folder) => folder.id === ancestorId);
}

/** Builds indented area choices (project root plus every folder) for move dialogs. */
export function areaChoiceOptions(
  projectName: string,
  folders: ReadonlyArray<Folder>,
): ReadonlyArray<ChoiceOption> {
  const nested = flattenFolderForest(buildFolderForest(folders)).map(({ folder, depth }) => ({
    value: folder.id,
    label: folder.name,
    depth: depth + 1,
  }));
  return [{ value: ROOT_AREA_CHOICE, label: projectName }, ...nested];
}
