import type { TodoItem } from "../../items/todo-item.js";
import type { ProjectExportData } from "../json/export-source.js";

type Comparer<T> = (left: T, right: T) => number;

/** Stable ordering by the given comparers, like LINQ `OrderBy(...).ThenBy(...)`. */
function sortedBy<T>(rows: readonly T[], ...comparers: ReadonlyArray<Comparer<T>>): T[] {
  return rows.toSorted((left, right) => {
    for (const compare of comparers) {
      const difference = compare(left, right);
      if (difference !== 0) {
        return difference;
      }
    }
    return 0;
  });
}

const bySortOrder = (left: { sortOrder: number }, right: { sortOrder: number }) =>
  left.sortOrder - right.sortOrder;

const byCreation: Comparer<TodoItem> = (left, right) =>
  Temporal.Instant.compare(left.createdAtUtc, right.createdAtUtc);

/**
 * A project's items the way they read on screen (§7.9): root items, then each
 * folder in turn depth first, sub-items under their parent. The input order
 * breaks ties, as in the legacy exporter.
 */
export function orderCsvItems(data: ProjectExportData): TodoItem[] {
  const ordered: TodoItem[] = [];
  const addWithChildren = (item: TodoItem) => {
    ordered.push(item);
    const children = data.items.filter((child) => child.parentItemId === item.id);
    sortedBy(children, bySortOrder).forEach(addWithChildren);
  };
  const addArea = (folderId: string | null) => {
    const topLevel = data.items.filter(
      (item) => item.folderId === folderId && item.parentItemId === null,
    );
    sortedBy(topLevel, bySortOrder, byCreation).forEach(addWithChildren);
    const subfolders = data.folders.filter((folder) => folder.parentFolderId === folderId);
    sortedBy(subfolders, bySortOrder).forEach((folder) => addArea(folder.id));
  };
  addArea(null);
  return ordered;
}
