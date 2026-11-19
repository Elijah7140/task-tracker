import { TaskTrackerClient } from "./task-tracker-client.js";

/** Creates a folder under the project root or another folder. */
export const createFolderAtom = TaskTrackerClient.mutation("CreateFolder");

/** Renames a folder. */
export const renameFolderAtom = TaskTrackerClient.mutation("RenameFolder");

/** Moves a folder under another parent in the same project. */
export const moveFolderAtom = TaskTrackerClient.mutation("MoveFolder");

/** Soft-deletes a folder with its sub-folders and items. */
export const deleteFolderAtom = TaskTrackerClient.mutation("DeleteFolder");
