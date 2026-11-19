import { CompletionService, FolderTree, ItemTree } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { checkRules } from "./hierarchy-rules.js";

/** Plan and persist reconciliation in the caller's transaction. */
export function projectCompletionOperations(sql: SqlClient.SqlClient) {
  const folders = folderRepository(sql);
  const items = projectItemRepository(sql);

  const plan = Effect.fnUntraced(function* (projectId: string, now: Temporal.Instant) {
    const folderRows = yield* folders.listAll(projectId);
    const itemRows = yield* items.listActive(projectId);
    return yield* checkRules(() => {
      const folderTree = new FolderTree(projectId, folderRows);
      const trashed = new Set(
        folderRows.filter((folder) => folder.deletedAtUtc !== null).map((folder) => folder.id),
      );
      const activeAreas = itemRows.filter(
        (item) => item.folderId === null || !trashed.has(item.folderId),
      );
      return Array.from(Map.groupBy(activeAreas, (item) => item.folderId)).flatMap(
        ([folderId, rows]) =>
          CompletionService.reconcileAll(new ItemTree(projectId, folderId, rows, folderTree), now)
            .changes,
      );
    });
  });

  return { plan, apply: items.setCompletion };
}

/** Reconcile active areas after restore if their project has automatic completion enabled. */
export function projectCompletionReconciler(sql: SqlClient.SqlClient) {
  const settings = settingsRepository(sql);
  const { plan, apply } = projectCompletionOperations(sql);

  return Effect.fnUntraced(function* (projectId: string, now: Temporal.Instant) {
    const effective = yield* readEffectiveSettings(settings, projectId);
    if (effective.autoCompleteParents.value) {
      const changes = yield* plan(projectId, now);
      yield* Effect.forEach(changes, (change) => apply({ ...change, projectId, now }), {
        discard: true,
      });
    }
  });
}
