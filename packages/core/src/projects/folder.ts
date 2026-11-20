import type { DeletionFields } from "../hierarchy/deletion-fields.js";
import { projectName } from "./project-name.js";

/** A named area in one project, optionally nested under another folder. */
export interface Folder extends DeletionFields {
  readonly id: string;
  readonly projectId: string;
  readonly parentFolderId: string | null;
  readonly name: string;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}

/** Create an active folder with a validated name. */
export function createFolder(
  id: string,
  projectId: string,
  parentFolderId: string | null,
  name: string,
  now: Temporal.Instant,
): Folder {
  return {
    id,
    name: projectName(name),
    projectId,
    parentFolderId,
    sortOrder: 0,
    createdAtUtc: now,
    updatedAtUtc: now,
    deletedAtUtc: null,
    deletionBatchId: null,
  };
}

/** Rename a folder and record when it changed. */
export function renameFolder(folder: Folder, newName: string, now: Temporal.Instant): Folder {
  return { ...folder, name: projectName(newName), updatedAtUtc: now };
}
