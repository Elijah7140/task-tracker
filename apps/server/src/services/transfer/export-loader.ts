import {
  EntityMissing,
  type ExportCatalogue,
  type ExportSource,
  type Project,
  type ProjectExportData,
} from "@task-tracker/core";
import { Effect, Option } from "effect";
import type { SqlClient } from "effect/sql";
import { fieldRepository } from "../../db/repositories/field-repository.js";
import { folderRepository } from "../../db/repositories/folder-repository.js";
import { itemFieldValueRepository } from "../../db/repositories/item-field-value-repository.js";
import { itemLinkRepository } from "../../db/repositories/item-link-repository.js";
import { lookupRepository } from "../../db/repositories/lookup-repository.js";
import { projectItemRepository } from "../../db/repositories/project-item-repository.js";
import { projectRepository } from "../../db/repositories/project-repository.js";
import { savedSearchRepository } from "../../db/repositories/saved-search-repository.js";
import { settingsRepository } from "../../db/repositories/settings-repository.js";
import { statusRepository } from "../../db/repositories/status-repository.js";
import { ticketDetailRepository } from "../../db/repositories/ticket-detail-repository.js";
import { ticketListRepository } from "../../db/repositories/ticket-list-repository.js";

/** Every lookup, field and choice, each in stored order. */
export const loadExportCatalogue = Effect.fnUntraced(function* (sql: SqlClient.SqlClient) {
  const lookups = lookupRepository(sql);
  const fields = fieldRepository(sql);
  const catalogue: ExportCatalogue = {
    priorityLevels: yield* lookups.priorityLevels.list(),
    statuses: yield* statusRepository(sql).list(),
    fields: yield* fields.definitions.list(),
    choices: yield* fields.choices.listAll(undefined),
    ticketLists: yield* ticketListRepository(sql).list(),
  };
  return catalogue;
});

/** The active folders, items, values and links of one project, with its overrides. */
const loadProject = Effect.fnUntraced(function* (sql: SqlClient.SqlClient, project: Project) {
  const data: ProjectExportData = {
    project,
    folders: yield* folderRepository(sql).listActive(project.id),
    items: yield* projectItemRepository(sql).listActive(project.id),
    values: yield* itemFieldValueRepository(sql).listForActiveItems(project.id),
    links: yield* itemLinkRepository(sql).listForActiveItems(project.id),
    ticketDetails: yield* ticketDetailRepository(sql).listForActiveItems(project.id),
    settings: yield* settingsRepository(sql).project(project.id),
  };
  return data;
});

const selectProjects = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  projectId: string | null,
) {
  const projects = projectRepository(sql);
  if (projectId === null) {
    return yield* projects.listActive();
  }
  const found = yield* projects.findActive(projectId);
  return Option.isSome(found) ? [found.value] : yield* Effect.fail(new EntityMissing("Project"));
});

/**
 * Loads the active projects with these ids for a CSV export, in order of first
 * appearance, leaving out any that are missing or deleted (§7.9).
 */
export const loadActiveProjects = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  projectIds: Iterable<string>,
) {
  const projects = projectRepository(sql);
  const found = yield* Effect.forEach(new Set(projectIds), (id) => projects.findActive(id));
  const active = found.flatMap((project) => (Option.isSome(project) ? [project.value] : []));
  return yield* Effect.forEach(active, (project) => loadProject(sql, project));
});

/** Loads one active project for a CSV export; a deleted one is refused. */
export const loadProjectForCsv = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  projectId: string,
) {
  const projects = yield* selectProjects(sql, projectId);
  return yield* Effect.forEach(projects, (project) => loadProject(sql, project));
});

/**
 * Loads what a JSON export writes on the caller's transaction: every active
 * project, or one project (a deleted one is refused), and the lookups, fields,
 * settings and saved searches (§7.9).
 */
export const loadExportSource = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  projectId: string | null,
  exportedAtUtc: Temporal.Instant,
) {
  const projects = yield* selectProjects(sql, projectId);
  const source: ExportSource = {
    wholeDatabase: projectId === null,
    exportedAtUtc,
    catalogue: yield* loadExportCatalogue(sql),
    projects: yield* Effect.forEach(projects, (project) => loadProject(sql, project)),
    globalSettings: yield* settingsRepository(sql).global(),
    savedSearches: yield* savedSearchRepository(sql).listRows(),
  };
  return source;
});
