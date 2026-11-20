import { ProjectWorkspaceRpcs } from "@task-tracker/contracts";
import type { Folder, Project } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { FolderService } from "../services/folder-service.js";
import { ProjectService } from "../services/project-service.js";
import { mapOperationError } from "./map-operation-error.js";

function projectProjection(project: Project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    iconKey: project.iconKey,
    sortOrder: project.sortOrder,
    createdAtUtc: project.createdAtUtc.toString(),
    updatedAtUtc: project.updatedAtUtc.toString(),
  };
}

function folderProjection(folder: Folder) {
  return {
    id: folder.id,
    projectId: folder.projectId,
    parentFolderId: folder.parentFolderId,
    name: folder.name,
    sortOrder: folder.sortOrder,
    createdAtUtc: folder.createdAtUtc.toString(),
    updatedAtUtc: folder.updatedAtUtc.toString(),
  };
}

/** Bind the project and folder RPCs to transactional services. */
export const projectWorkspaceHandlers = (timeZone: string) =>
  ProjectWorkspaceRpcs.toLayer(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const folders = yield* FolderService;

      return {
        ListProjects: () =>
          projects.list().pipe(
            Effect.map((summaries) =>
              summaries.map((summary) => ({
                ...summary,
                project: projectProjection(summary.project),
              })),
            ),
            mapOperationError,
          ),
        CreateProject: ({ name }) =>
          projects.create(name).pipe(Effect.map(projectProjection), mapOperationError),
        LoadWorkspace: ({ projectId }) =>
          projects.loadWorkspace(projectId).pipe(
            Effect.map(({ name, folders }) => ({
              projectId,
              name,
              folders: folders.all.map(folderProjection),
            })),
            mapOperationError,
          ),
        CreateFolder: ({ projectId, parentFolderId, name }) =>
          folders
            .create(projectId, parentFolderId, name)
            .pipe(Effect.map(folderProjection), mapOperationError),
        RenameProject: ({ projectId, name }) =>
          projects.rename(projectId, name).pipe(mapOperationError),
        SetProjectIcon: ({ projectId, iconKey }) =>
          projects.setIcon(projectId, iconKey).pipe(mapOperationError),
        ReorderProjects: ({ projectIds }) => projects.reorder(projectIds).pipe(mapOperationError),
        RenameFolder: ({ projectId, folderId, name }) =>
          folders.rename(projectId, folderId, name).pipe(mapOperationError),
        MoveFolder: ({ projectId, folderId, parentFolderId }) =>
          folders.move(projectId, folderId, parentFolderId).pipe(mapOperationError),
        ReorderFolders: ({ projectId, parentFolderId, folderIds }) =>
          folders.reorder(projectId, parentFolderId, folderIds).pipe(mapOperationError),
        DeleteProject: ({ projectId }) => projects.delete(projectId).pipe(mapOperationError),
        RestoreProject: ({ batchId }) => projects.restore(batchId).pipe(mapOperationError),
        DeleteFolder: ({ projectId, folderId }) =>
          folders.delete(projectId, folderId).pipe(mapOperationError),
        RestoreFolder: ({ projectId, batchId }) =>
          folders.restore(projectId, batchId).pipe(mapOperationError),
      };
    }),
  ).pipe(Layer.provide(Layer.merge(ProjectService.layer(timeZone), FolderService.layer)));
