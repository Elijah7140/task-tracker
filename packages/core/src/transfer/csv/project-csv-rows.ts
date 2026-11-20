import type { ItemFieldValue } from "../../fields/item-field-value.js";
import type { ItemLink } from "../../items/item-link.js";
import type { TodoItem } from "../../items/todo-item.js";
import type { Folder } from "../../projects/folder.js";
import type { ProjectExportData } from "../json/export-source.js";

const FOLDER_SEPARATOR = "/";

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group === undefined) {
      groups.set(key(row), [row]);
    } else {
      group.push(row);
    }
  }
  return groups;
}

function pathOf(folder: Folder, foldersById: ReadonlyMap<string, Folder>): string {
  const names = [folder.name];
  for (let current = folder; current.parentFolderId !== null;) {
    current = foldersById.get(current.parentFolderId)!;
    names.unshift(current.name);
  }
  return names.join(FOLDER_SEPARATOR);
}

/** Folder paths, parent titles, links and custom values of one exported project, by item. */
export class ProjectCsvRows {
  readonly #folderPaths: ReadonlyMap<string, string>;
  readonly #itemsById: ReadonlyMap<string, TodoItem>;
  readonly #values: ReadonlyMap<string, ItemFieldValue[]>;
  readonly #links: ReadonlyMap<string, ItemLink[]>;

  constructor(readonly data: ProjectExportData) {
    const foldersById = new Map(data.folders.map((folder) => [folder.id, folder]));
    this.#folderPaths = new Map(data.folders.map((f) => [f.id, pathOf(f, foldersById)]));
    this.#itemsById = new Map(data.items.map((item) => [item.id, item]));
    this.#values = groupBy(data.values, (value) => value.itemId);
    this.#links = groupBy(data.links, (link) => link.itemId);
  }

  /** The item's folder names from the top level down, joined by `/`; empty at the root. */
  folderPath(item: TodoItem): string {
    return item.folderId === null ? "" : this.#folderPaths.get(item.folderId)!;
  }

  /** The title of the item's parent; empty for a top-level item. */
  parentTitle(item: TodoItem): string {
    return item.parentItemId === null ? "" : this.#itemsById.get(item.parentItemId)!.title;
  }

  /** The item's links in display order. */
  linksOf(item: TodoItem): ItemLink[] {
    return (this.#links.get(item.id) ?? []).toSorted(
      (left, right) => left.sortOrder - right.sortOrder,
    );
  }

  /** The item's custom values in loaded order. */
  valuesOf(item: TodoItem): readonly ItemFieldValue[] {
    return this.#values.get(item.id) ?? [];
  }
}
