import { HierarchyError, TrashProject, type Project } from "@task-tracker/core";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { trashRepository } from "../db/repositories/trash-repository.js";
import { checkRules } from "./check-rules.js";
import { operationTime } from "./operation-time.js";
import { projectCompletionReconciler } from "./project-completion-reconciler.js";
import { UndoService, undoLabel } from "./undo-service.js";

const missingBatch = () =>
  new HierarchyError(
    "That deletion no longer exists. It may already have been restored or deleted permanently.",
  );

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const items = projectItemRepository(sql);
  const trash = trashRepository(sql);
  const reconcile = projectCompletionReconciler(sql);

  const loadProject = Effect.fnUntraced(function* (project: Project) {
    const folderRows = yield* folders.listAll(project.id);
    const itemRows = yield* items.listAll(project.id);
    return new TrashProject(project, folderRows, itemRows);
  });

  const loadBatch = Effect.fnUntraced(function* (batchId: string) {
    const project = yield* projects.findWithBatch(batchId);
    if (Option.isNone(project)) {
      return yield* Effect.fail(missingBatch());
    }
    const rows = yield* loadProject(project.value);
    const batches = yield* checkRules(() => rows.batches());
    const batch = batches.find((candidate) => candidate.id === batchId.toUpperCase());
    return batch === undefined ? yield* Effect.fail(missingBatch()) : { rows, batch };
  });

  const list = Effect.fnUntraced(function* (projectId: string | null) {
    const found = yield* projects.listWithDeletions(projectId);
    const groups = yield* Effect.forEach(found, (project) =>
      loadProject(project).pipe(
        Effect.flatMap((rows) =>
          checkRules(() => {
            const batches = rows.batches();
            return batches.map((batch) => rows.describe(batch, batches.length));
          }),
        ),
      ),
    );
    return groups
      .flat()
      .sort(
        (left, right) =>
          Temporal.Instant.compare(right.deletedAtUtc, left.deletedAtUtc) ||
          right.batchId.localeCompare(left.batchId),
      );
  }, sql.withTransaction);

  const restore = Effect.fnUntraced(function* (batchId: string) {
    const { rows, batch } = yield* loadBatch(batchId);
    const reason = rows.restoreBlockedReason(batch);
    if (reason !== null) {
      return yield* Effect.fail(new HierarchyError(reason));
    }
    const { kind, row } = batch.top;
    const title = kind === "item" ? row.title : row.name;
    const activeProjects = kind === "project" ? yield* projects.listActive() : [];
    const sortOrder = rows.restoreOrder(batch, activeProjects);
    const projectId = rows.project.id;
    const change = { projectId, batchId: batch.id, now: yield* operationTime };
    const where = sql`ProjectId = ${projectId}`;
    yield* undo.capture(undoLabel("Restore", title), [
      ...(kind === "project" ? [{ table: "Project", where: sql`Id = ${projectId}` } as const] : []),
      ...(kind !== "item" ? [{ table: "Folder", where } as const] : []),
      { table: "TodoItem", where },
    ]);
    if (kind === "project") {
      yield* projects.restore(change);
    }
    if (kind !== "item") {
      yield* folders.restoreForProject(change);
    }
    yield* items.restoreBatch(change);
    yield* trash.placeRestoredTop(kind, row.id, sortOrder);
    yield* reconcile(projectId, change.now);
  }, undo.record);

  const remove = Effect.fnUntraced(function* (plan: ReturnType<TrashProject["purgePlan"]>) {
    yield* Effect.forEach(plan.itemIds, trash.deleteItem, { discard: true });
    yield* Effect.forEach(plan.folderIds, trash.deleteFolder, { discard: true });
    if (plan.projectId !== null) {
      yield* trash.deleteProject(plan.projectId);
    }
  });

  const purge = Effect.fnUntraced(function* (batchId: string) {
    const { rows, batch } = yield* loadBatch(batchId);
    const plan = yield* checkRules(() => rows.purgePlan(batch));
    yield* remove(plan);
  }, sql.withTransaction);

  const empty = Effect.fnUntraced(function* (projectId: string | null) {
    for (const project of yield* projects.listWithDeletions(projectId)) {
      const rows = yield* loadProject(project);
      const plan = yield* checkRules(() => rows.purgePlan());
      yield* remove(plan);
    }
  }, sql.withTransaction);

  return { list, restore, purge, empty };
});

/** Transactional listing, restore and permanent removal of deletion batches. */
export class TrashService extends Context.Service<TrashService>()(
  "@task-tracker/server/TrashService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
