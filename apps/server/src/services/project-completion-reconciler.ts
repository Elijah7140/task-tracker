import { CompletionService, FolderTree, ItemTree } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { checkRules } from "./hierarchy-rules.js";

/** Reconcile active areas after restore while the caller still owns the write transaction. */
export function projectCompletionReconciler(sql: SqlClient.SqlClient) {
  const folders = folderRepository(sql);
  const items = projectItemRepository(sql);
  const settings = settingsRepository(sql);

  return Effect.fnUntraced(function* (projectId: string, now: Temporal.Instant) {
    const effective = yield* readEffectiveSettings(settings, projectId);
    if (!effective.autoCompleteParents.value) {
      return;
    }

    const folderRows = yield* folders.listAll(projectId);
    const itemRows = yield* items.listActive(projectId);
    const changes = yield* checkRules(() => {
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
    yield* Effect.forEach(changes, (change) => items.setCompletion({ ...change, projectId, now }), {
      discard: true,
    });
  });
}
