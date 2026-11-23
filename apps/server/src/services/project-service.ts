import {
  createProject,
  FolderTree,
  EntityMissing,
  overdueDateBound,
  renameProject,
  reorderProjects,
  setProjectIcon,
  summarizeProject,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { projectSummaryRepository } from "../db/repositories/project-summary-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { projectCompletionReconciler } from "./project-completion-reconciler.js";
import type { ProjectWorkspaceSnapshot } from "./project-workspace-snapshot.js";
import { UndoService, undoLabel } from "./undo-service.js";

const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const projectBranch = (projectId: string) =>
    [
      { table: "Project", where: sql`Id = ${projectId}` },
      { table: "Folder", where: sql`ProjectId = ${projectId}` },
      { table: "TodoItem", where: sql`ProjectId = ${projectId}` },
    ] as const;
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const items = projectItemRepository(sql);
  const summaries = projectSummaryRepository(sql);
  const reconcile = projectCompletionReconciler(sql);

  const create = Effect.fnUntraced(function* (name: string) {
    const now = yield* operationTime;
    const project = yield* checkRules(() => createProject(newId(now), name, now));
    yield* undo.capture(undoLabel("Create", project.name), [
      { table: "Project", where: sql`Id = ${project.id}` },
    ]);
    yield* projects.insert(project);
    return project;
  }, undo.record);

  const rename = Effect.fnUntraced(function* (id: string, name: string) {
    const project = yield* projects.requireActive(id);
    const now = yield* operationTime;
    const renamed = yield* checkRules(() => renameProject(project, name, now));
    yield* undo.capture(undoLabel("Rename", renamed.name), [
      { table: "Project", where: sql`Id = ${project.id}` },
    ]);
    yield* projects.update(renamed);
  }, undo.record);

  /** Sets or clears the icon on the Home card and in the sidebar (§7.19). */
  const setIcon = Effect.fnUntraced(function* (id: string, iconKey: string | null) {
    const project = yield* projects.requireActive(id);
    if (project.iconKey === iconKey) {
      return;
    }
    const now = yield* operationTime;
    const updated = yield* checkRules(() => setProjectIcon(project, iconKey, now));
    yield* undo.capture(undoLabel("Change icon of", project.name), [
      { table: "Project", where: sql`Id = ${project.id}` },
    ]);
    yield* projects.updateIcon(updated);
  }, undo.record);

  const reorder = Effect.fnUntraced(function* (ids: readonly string[]) {
    const orderedIds = yield* decodeIds(ids);
    const rows = yield* projects.listActive();
    const now = yield* operationTime;
    const ordered = yield* checkRules(() => reorderProjects(rows, orderedIds, now));
    yield* undo.capture("Reorder projects", [{ table: "Project" }]);
    yield* Effect.forEach(ordered, projects.update, { discard: true });
  }, undo.record);

  /**
   * Home and sidebar summaries. The sidebar reloads them after most item writes,
   * so they read counts and likely-overdue deadlines without loading item rows.
   */
  const list = Effect.fnUntraced(function* () {
    const rows = yield* projects.listActive();
    const now = yield* operationTime;
    const counts = yield* summaries.countOpen();
    const deadlines = yield* summaries.listOpenDeadlinesBefore(overdueDateBound(now, timeZone));
    const openCounts = new Map(counts.map(({ projectId, openCount }) => [projectId, openCount]));
    const openDeadlines = Map.groupBy(deadlines, ({ projectId }) => projectId);
    return rows.map((project) =>
      summarizeProject(
        project,
        openCounts.get(project.id) ?? 0,
        openDeadlines.get(project.id) ?? [],
        now,
        timeZone,
      ),
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
    yield* undo.capture(undoLabel("Delete", project.name), projectBranch(project.id));
    yield* projects.delete(change);
    yield* folders.deleteForProject(change);
    yield* items.deleteForProject(change);
    return batchId;
  }, undo.record);

  const restore = Effect.fnUntraced(function* (batchId: string) {
    const project = yield* projects.findDeletedBatch(batchId);
    if (Option.isNone(project)) {
      return yield* Effect.fail(
        new EntityMissing("DeletionBatch", "Project deletion batch was not found."),
      );
    }
    const now = yield* operationTime;
    const change = { projectId: project.value.id, batchId, now };
    yield* undo.capture(undoLabel("Restore", project.value.name), projectBranch(project.value.id));
    yield* projects.restore(change);
    yield* folders.restoreForProject(change);
    yield* items.restoreBatch(change);
    yield* reconcile(project.value.id, now);
  }, undo.record);

  return {
    create,
    rename,
    setIcon,
    reorder,
    list,
    loadWorkspace,
    delete: deleteProject,
    restore,
  };
});

/** Transactional project operations, home summaries and workspace snapshots. */
export class ProjectService extends Context.Service<ProjectService>()(
  "@task-tracker/server/ProjectService",
  { make },
) {
  static readonly layer = (timeZone: string) => Layer.effect(this, make(timeZone));
}
