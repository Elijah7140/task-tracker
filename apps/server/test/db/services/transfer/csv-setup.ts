import { parseCsv } from "@task-tracker/core";
import { Effect } from "effect";
import type { JsonDocument } from "./transfer-json.js";
import { randomGuid } from "./transfer-json.js";
import { projectId } from "./transfer-rows.js";
import { readRows, type TransferWorld } from "./transfer-world.js";

/** An item of a seed project, in the version 1 JSON shape without ids. */
export type SeedItem = JsonDocument & { readonly title: string };

/** A custom field of a seed document; `scope: "project"` makes it the first project's own. */
export interface SeedField {
  readonly key: string;
  readonly displayName: string;
  readonly dataType: "Text" | "Number" | "Date" | "Boolean" | "Choice";
  readonly scope?: "global" | "project";
  readonly choices?: readonly string[];
}

/** A seed project and its root items. */
export interface SeedProject {
  readonly name: string;
  readonly items?: readonly SeedItem[];
  readonly folders?: readonly string[];
}

/**
 * A version 1 JSON document that sets up CSV test data: projects with items
 * (folder items name their folder in `folder`), fields and extra lookups.
 */
export function seedDocument(
  projects: readonly SeedProject[],
  fields: readonly SeedField[] = [],
  extra: JsonDocument = {},
): string {
  const projectIds = projects.map(() => randomGuid());
  const fieldDocuments = fields.map((field, index) => ({
    id: randomGuid(),
    key: field.key,
    displayName: field.displayName,
    dataType: field.dataType,
    ...(field.scope === "project" ? { projectId: projectIds[0] } : {}),
    isArchived: false,
    sortOrder: index,
    choices: (field.choices ?? []).map((label, order) => ({
      id: randomGuid(),
      label,
      sortOrder: order,
      isArchived: false,
    })),
  }));
  const projectDocuments = projects.map((project, index) => {
    const folders = (project.folders ?? []).map((name, order) => ({
      id: randomGuid(),
      name,
      sortOrder: order,
    }));
    const folderId = (name: unknown) => folders.find((folder) => folder.name === name)?.id;
    const items = (project.items ?? []).map(({ folder, ...item }, order) => ({
      id: randomGuid(),
      sortOrder: order,
      ...(folder === undefined ? {} : { folderId: folderId(folder) }),
      ...item,
    }));
    return { id: projectIds[index], name: project.name, sortOrder: index, folders, items };
  });
  return JSON.stringify({
    format: "task-tracker",
    version: 1,
    fields: fieldDocuments,
    projects: projectDocuments,
    ...extra,
  });
}

/** Imports a seed document and fails the test when it is refused. */
export const seed = (world: TransferWorld, document: string) =>
  Effect.gen(function* () {
    const result = yield* world.importJson(document);
    if (result.kind !== "imported") {
      return yield* Effect.die(new Error(JSON.stringify(result.issues)));
    }
  });

/** Creates an empty project through a JSON import and returns its id. */
export const createProject = (world: TransferWorld, name: string) =>
  Effect.gen(function* () {
    yield* seed(world, seedDocument([{ name }]));
    return yield* projectId(world, name);
  });

/** The CSV text as cells by header name, one map per item row. */
export function csvRows(text: string): Array<Record<string, string>> {
  const [header, ...records] = parseCsv(text).records;
  return records.map((record) =>
    Object.fromEntries(header!.cells.map((name, index) => [name, record.cells[index] ?? ""])),
  );
}

/** The row with this title. */
export const csvRow = (text: string, title: string) =>
  csvRows(text).find((row) => row.Title === title)!;

/** The header cells of CSV text. */
export const csvHeader = (text: string) => parseCsv(text).records[0]!.cells;

/** The id of the folder with this name in a project. */
export const folderNamed = (world: TransferWorld, project: string, name: string) =>
  Effect.map(
    readRows<{ Id: string }>(
      world,
      "SELECT Id FROM Folder WHERE ProjectId = ? AND Name = ?",
      project,
      name,
    ),
    (rows) => rows[0]!.Id,
  );
