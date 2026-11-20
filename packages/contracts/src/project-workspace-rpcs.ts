import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { FolderProjection } from "./folder-projection.js";
import { Guid } from "./guid.js";
import { ProjectProjection } from "./project-projection.js";
import { ProjectSummary } from "./project-summary.js";
import { ProjectWorkspace } from "./project-workspace.js";
import { RpcOperationError } from "./rpc-operation-error.js";

/** RPC procedures for project home, workspace navigation and folder management. */
export const ProjectWorkspaceRpcs = RpcGroup.make(
  Rpc.make("ListProjects", {
    success: Schema.Array(ProjectSummary),
    error: RpcOperationError,
  }),
  Rpc.make("CreateProject", {
    payload: { name: Schema.String },
    success: ProjectProjection,
    error: RpcOperationError,
  }),
  Rpc.make("LoadWorkspace", {
    payload: { projectId: Guid },
    success: ProjectWorkspace,
    error: RpcOperationError,
  }),
  Rpc.make("CreateFolder", {
    payload: { projectId: Guid, parentFolderId: Schema.NullOr(Guid), name: Schema.String },
    success: FolderProjection,
    error: RpcOperationError,
  }),
  Rpc.make("RenameProject", {
    payload: { projectId: Guid, name: Schema.String },
    error: RpcOperationError,
  }),
  Rpc.make("ReorderProjects", {
    payload: { projectIds: Schema.Array(Guid) },
    error: RpcOperationError,
  }),
  Rpc.make("RenameFolder", {
    payload: { projectId: Guid, folderId: Guid, name: Schema.String },
    error: RpcOperationError,
  }),
  Rpc.make("MoveFolder", {
    payload: { projectId: Guid, folderId: Guid, parentFolderId: Schema.NullOr(Guid) },
    error: RpcOperationError,
  }),
  Rpc.make("ReorderFolders", {
    payload: {
      projectId: Guid,
      parentFolderId: Schema.NullOr(Guid),
      folderIds: Schema.Array(Guid),
    },
    error: RpcOperationError,
  }),
  Rpc.make("DeleteProject", {
    payload: { projectId: Guid },
    success: Guid,
    error: RpcOperationError,
  }),
  Rpc.make("RestoreProject", {
    payload: { batchId: Guid },
    error: RpcOperationError,
  }),
  Rpc.make("DeleteFolder", {
    payload: { projectId: Guid, folderId: Guid },
    success: Guid,
    error: RpcOperationError,
  }),
  Rpc.make("RestoreFolder", {
    payload: { projectId: Guid, batchId: Guid },
    error: RpcOperationError,
  }),
);
