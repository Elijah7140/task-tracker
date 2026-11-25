import { FolderTree, priorityLabel, type ItemSearchResult } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { statusRepository } from "../db/repositories/status-repository.js";

/** A search result with its project and folder path and lookup display names. */
export interface ProjectedSearchResult extends ItemSearchResult {
  /** Project name followed by each folder name down to the item's folder. */
  readonly location: ReadonlyArray<string>;
  readonly priorityLabel: string | null;
  readonly statusName: string | null;
}

interface ResultLabels {
  readonly trees: ReadonlyMap<string, FolderTree>;
  readonly priorityLabels: ReadonlyMap<string, string>;
  readonly statusNames: ReadonlyMap<string, string>;
}

/** Resolves the location and lookup labels search results display, on the caller's transaction. */
export function searchResultProjection(sql: SqlClient.SqlClient) {
  const folders = folderRepository(sql);
  const lookups = lookupRepository(sql);
  const statuses = statusRepository(sql);

  const loadTrees = (projectIds: ReadonlyArray<string>) =>
    Effect.forEach(projectIds, (projectId) =>
      folders
        .listActive(projectId)
        .pipe(Effect.map((rows) => [projectId, new FolderTree(projectId, rows)] as const)),
    ).pipe(Effect.map((entries) => new Map(entries)));

  const loadLabels = Effect.fnUntraced(function* (results: ReadonlyArray<ItemSearchResult>) {
    const projectIds = [...new Set(results.map((result) => result.projectId))];
    const levels = yield* lookups.priorityLevels.list();
    const statusRows = yield* statuses.list();
    return {
      trees: yield* loadTrees(projectIds),
      priorityLabels: new Map(levels.map((level) => [level.id, priorityLabel(level)])),
      statusNames: new Map(statusRows.map((status) => [status.id, status.name])),
    } satisfies ResultLabels;
  });

  /** Adds locations and labels to a page of results. */
  return Effect.fnUntraced(function* (results: ReadonlyArray<ItemSearchResult>) {
    if (results.length === 0) {
      return [] as ReadonlyArray<ProjectedSearchResult>;
    }
    const labels = yield* loadLabels(results);
    return results.map((result) => projectResult(result, labels));
  });
}

function projectResult(result: ItemSearchResult, labels: ResultLabels): ProjectedSearchResult {
  const label = (names: ReadonlyMap<string, string>, id: string | null) =>
    id === null ? null : (names.get(id) ?? null);
  return {
    ...result,
    location: folderPath(result, labels.trees.get(result.projectId)),
    priorityLabel: label(labels.priorityLabels, result.priorityLevelId),
    statusName: label(labels.statusNames, result.statusId),
  };
}

function folderPath(result: ItemSearchResult, tree: FolderTree | undefined): ReadonlyArray<string> {
  if (result.folderId === null || tree === undefined) {
    return [result.projectName];
  }
  const ancestors = [...tree.ancestors(result.folderId)].map((folder) => folder.name).toReversed();
  return [result.projectName, ...ancestors, tree.get(result.folderId).name];
}
