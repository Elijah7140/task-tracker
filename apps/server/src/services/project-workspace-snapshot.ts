import type { FolderTree } from "@task-tracker/core";

/** A project's name and active folder tree read in the same transaction. */
export interface ProjectWorkspaceSnapshot {
  readonly name: string;
  readonly folders: FolderTree;
}
