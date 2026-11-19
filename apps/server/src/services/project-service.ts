import {
  createProject,
  FolderTree,
  HierarchyError,
  renameProject,
  reorderProjects,
  summarizeProject,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { checkRules } from "./hierarchy-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { projectCompletionReconciler } from "./project-completion-reconciler.js";
import type { ProjectWorkspaceSnapshot } from "./project-workspace-snapshot.js";

const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const items = projectItemRepository(sql);
  const settings = settingsRepository(sql);
  const reconcile = projectCompletionReconciler(sql);

  const create = Effect.fnUntraced(function* (name: string) {
    const now = yield* operationTime;
    const project = yield* checkRules(() => createProject(newId(now), name, now));
    yield* projects.insert(project);
    return project;
  }, sql.withTransaction);

  const rename = Effect.fnUntraced(function* (id: string, name: string) {
    const project = yield* projects.requireActive(id);
    const now = yield* operationTime;
    const renamed = yield* checkRules(() => renameProject(project, name, now));
    yield* projects.update(renamed);
  }, sql.withTransaction);

  const reorder = Effect.fnUntraced(function* (ids: readonly string[]) {
    const orderedIds = yield* decodeIds(ids);
    const rows = yield* projects.listActive();
    const now = yield* operationTime;
    const ordered = yield* checkRules(() => reorderProjects(rows, orderedIds, now));
    yield* Effect.forEach(ordered, projects.update, { discard: true });
  }, sql.withTransaction);

  const list = Effect.fnUntraced(function* () {
    const rows = yield* projects.listActive();
    const now = yield* operationTime;
    const global = yield* settings.global();
    return yield* Effect.forEach(rows, (project) =>
      Effect.gen(function* () {
        const projectItems = yield* items.listActive(project.id);
        const effective = yield* readEffectiveSettings(
          settings,
          project.id,
          Effect.succeed(global),
        );
        return summarizeProject(project, projectItems, effective, now, timeZone);
      }),
    );
  }, sql.withTransaction);

  const loadWorkspace = Effect.fnUntraced(function* (id: string) {
    const project = yield* projects.requireActive(id);
    const rows = yield* folders.listActive(project.id);
    return yield* checkRules((): ProjectWorkspaceSnapshot => ({
      name: project.name,
      folders: new FolderTree(project.id, rows),
    }));
  }, sql.withTransaction);

  const deleteProject = Effect.fnUntraced(function* (id: string) {
    const project = yield* projects.requireActive(id);
    const now = yield* operationTime;
    const batchId = newId(now);
    const change = { projectId: project.id, batchId, now };
    yield* projects.delete(change);
    yield* folders.deleteForProject(change);
    yield* items.deleteForProject(change);
    return batchId;
  }, sql.withTransaction);

  const restore = Effect.fnUntraced(function* (batchId: string) {
    const project = yield* projects.findDeletedBatch(batchId);
    if (Option.isNone(project)) {
      return yield* Effect.fail(new HierarchyError("Project deletion batch was not found."));
    }
    const now = yield* operationTime;
    const change = { projectId: project.value.id, batchId, now };
    yield* projects.restore(change);
    yield* folders.restoreForProject(change);
    yield* items.restoreBatch(change);
    yield* reconcile(project.value.id, now);
  }, sql.withTransaction);

  return { create, rename, reorder, list, loadWorkspace, delete: deleteProject, restore };
});

/** Transactional project operations, home summaries and workspace snapshots. */
export class ProjectService extends Context.Service<ProjectService>()(
  "@task-tracker/server/ProjectService",
  { make },
) {
  static readonly layer = (timeZone: string) => Layer.effect(this, make(timeZone));
}
