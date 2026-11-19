import { HierarchyError } from "../hierarchy/hierarchy-error.js";
import type { TodoItem } from "../items/todo-item.js";
import type { Folder } from "../projects/folder.js";
import type { Project } from "../projects/project.js";

type BranchRows = { readonly folders: readonly Folder[]; readonly items: readonly TodoItem[] };

type TrashTop =
  | { readonly kind: "project"; readonly row: Project }
  | { readonly kind: "folder"; readonly row: Folder }
  | { readonly kind: "item"; readonly row: TodoItem };

/** The rows deleted together, with the node whose deletion initiated the batch. */
export type TrashBatch = BranchRows & { readonly id: string; readonly top: TrashTop };

type LocationNode = { readonly name: string; readonly deletedAtUtc: Temporal.Instant | null };

function pathTo<Row>(
  start: string | null,
  rows: ReadonlyMap<string, Row>,
  parent: (row: Row) => string | null,
  name: (row: Row) => string,
) {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let id = start; id !== null && !seen.has(id);) {
    const row = rows.get(id);
    if (row === undefined) {
      break;
    }
    seen.add(id);
    names.push(name(row));
    id = parent(row);
  }
  return names.reverse();
}

function rootOf<Row extends { readonly id: string }>(
  rows: readonly Row[],
  parent: (row: Row) => string | null,
) {
  const ids = new Set<string | null>(rows.map((row) => row.id));
  const root = rows.find((row) => !ids.has(parent(row)));
  if (root === undefined) {
    throw new HierarchyError("The deletion batch has no top node.");
  }
  return root;
}

function belongsTo(name: string, owner: string) {
  return new HierarchyError(
    `'${name}' still belongs to '${owner}'. Delete '${name}' permanently first.`,
  );
}

/** Largest active sibling position plus one, preserving the spacing of existing rows. */
export function appendRestoreOrder(siblings: Iterable<{ readonly sortOrder: number }>): number {
  let largest: number | undefined;
  for (const { sortOrder } of siblings) {
    largest = largest === undefined ? sortOrder : Math.max(largest, sortOrder);
  }
  return largest === undefined ? 0 : largest + 1;
}

/** Snapshot of a project including deleted rows, used to describe and validate Trash operations. */
export class TrashProject {
  readonly #folders: ReadonlyMap<string, Folder>;
  readonly #items: ReadonlyMap<string, TodoItem>;

  constructor(
    readonly project: Project,
    readonly folders: readonly Folder[],
    readonly items: readonly TodoItem[],
  ) {
    this.#folders = new Map(folders.map((row) => [row.id, row]));
    this.#items = new Map(items.map((row) => [row.id, row]));
  }

  /** Find each batch once and retain the membership used by the restore and purge rules. */
  batches(): TrashBatch[] {
    const folders = Map.groupBy(this.folders.filter(isBatched), (row) => row.deletionBatchId);
    const items = Map.groupBy(this.items.filter(isBatched), (row) => row.deletionBatchId);
    const projectBatch = isBatched(this.project) ? this.project.deletionBatchId : null;
    const ids = new Set([...folders.keys(), ...items.keys()]);
    if (projectBatch !== null) {
      ids.add(projectBatch);
    }
    return [...ids].map((id) => {
      const batchFolders = folders.get(id) ?? [];
      const batchItems = items.get(id) ?? [];
      return {
        id,
        top: this.topOf(id === projectBatch, batchFolders, batchItems),
        folders: batchFolders,
        items: batchItems,
      };
    });
  }

  private topOf(
    projectBatch: boolean,
    folders: readonly Folder[],
    items: readonly TodoItem[],
  ): TrashTop {
    if (projectBatch) {
      return { kind: "project", row: this.project };
    }
    if (folders.length > 0) {
      return { kind: "folder", row: rootOf(folders, (row) => row.parentFolderId) };
    }
    return { kind: "item", row: rootOf(items, (row) => row.parentItemId) };
  }

  /** Describe the row using the recorded ancestry even if its ancestors are also deleted. */
  describe(batch: TrashBatch, batchCount: number) {
    const { top } = batch;
    return {
      batchId: batch.id,
      kind: top.kind,
      topNodeId: top.row.id,
      title: top.kind === "item" ? top.row.title : top.row.name,
      projectId: this.project.id,
      path: this.location(top),
      deletedAtUtc: top.row.deletedAtUtc!.toString(),
      folderCount: batch.folders.length,
      itemCount: batch.items.length,
      earlierBatchCount: top.kind === "project" ? batchCount - 1 : 0,
      restoreBlockedReason: this.restoreBlockedReason(batch),
    };
  }

  private location(top: TrashTop): string[] {
    if (top.kind === "project") {
      return [];
    }
    const folderId = top.kind === "folder" ? top.row.parentFolderId : top.row.folderId;
    const itemId = top.kind === "item" ? top.row.parentItemId : null;
    return [
      this.project.name,
      ...pathTo(
        folderId,
        this.#folders,
        (row) => row.parentFolderId,
        (row) => row.name,
      ),
      ...pathTo(
        itemId,
        this.#items,
        (row) => row.parentItemId,
        (row) => row.title,
      ),
    ];
  }

  private deletedFolder(id: string | null): LocationNode | undefined {
    const folder = id === null ? undefined : this.#folders.get(id);
    return folder?.deletedAtUtc ? folder : undefined;
  }

  /** Report the nearest deleted owner that must be restored before the batch. */
  restoreBlockedReason({ top }: TrashBatch): string | null {
    if (top.kind === "project") {
      return null;
    }
    if (top.kind === "item" && top.row.parentItemId !== null) {
      const parent = this.#items.get(top.row.parentItemId);
      if (parent?.deletedAtUtc) {
        return `Restore the item '${parent.title}' first`;
      }
    }
    const folder = this.deletedFolder(
      top.kind === "item" ? top.row.folderId : top.row.parentFolderId,
    );
    if (folder !== undefined) {
      return `Restore the folder '${folder.name}' first`;
    }
    return this.project.deletedAtUtc === null ? null : "Restore the project first";
  }

  /** Place a restored branch after its live siblings. Descendants retain their existing positions. */
  restoreOrder({ top }: TrashBatch, activeProjects: readonly Project[]): number {
    switch (top.kind) {
      case "project":
        return appendRestoreOrder(activeProjects);
      case "folder":
        return appendRestoreOrder(
          this.folders.filter(
            (row) => row.deletedAtUtc === null && row.parentFolderId === top.row.parentFolderId,
          ),
        );
      case "item":
        return appendRestoreOrder(
          this.items.filter(
            (row) =>
              row.deletedAtUtc === null &&
              row.folderId === top.row.folderId &&
              row.parentItemId === top.row.parentItemId,
          ),
        );
    }
  }

  /** Choose purge rows and check that no remaining row still refers to them. */
  purgePlan(batch?: TrashBatch) {
    const includeProject =
      batch === undefined ? this.project.deletedAtUtc !== null : batch.top.kind === "project";
    const folders = includeProject
      ? this.folders
      : (batch?.folders ?? this.folders.filter(isDeleted));
    const items = includeProject ? this.items : (batch?.items ?? this.items.filter(isDeleted));
    if (!includeProject) {
      this.requireNoDependents(folders, items);
    }
    return {
      projectId: includeProject ? this.project.id : null,
      itemIds: childrenFirst(items, (row) => row.parentItemId),
      folderIds: childrenFirst(folders, (row) => row.parentFolderId),
    };
  }

  private requireNoDependents(folders: readonly Folder[], items: readonly TodoItem[]) {
    const folderNames = new Map<string | null, string>(folders.map((row) => [row.id, row.name]));
    const itemNames = new Map<string | null, string>(items.map((row) => [row.id, row.title]));
    for (const row of this.items) {
      const owner = itemNames.get(row.parentItemId) ?? folderNames.get(row.folderId);
      if (!itemNames.has(row.id) && owner !== undefined) {
        throw belongsTo(row.title, owner);
      }
    }
    for (const row of this.folders) {
      const owner = folderNames.get(row.parentFolderId);
      if (!folderNames.has(row.id) && owner !== undefined) {
        throw belongsTo(row.name, owner);
      }
    }
  }
}

function isDeleted(row: { readonly deletedAtUtc: Temporal.Instant | null }) {
  return row.deletedAtUtc !== null;
}

function isBatched<
  Row extends {
    readonly deletedAtUtc: Temporal.Instant | null;
    readonly deletionBatchId: string | null;
  },
>(row: Row): row is Row & { readonly deletionBatchId: string } {
  return isDeleted(row) && row.deletionBatchId !== null;
}

/** Use an iterative traversal so purging deep branches does not depend on the JS stack. */
function childrenFirst<Row extends { readonly id: string }>(
  rows: readonly Row[],
  parentOf: (row: Row) => string | null,
) {
  const parents = new Map<string | null, string | null>(rows.map((row) => [row.id, parentOf(row)]));
  const parentsFirst: string[] = [];
  for (const { id } of rows) {
    const chain = new Set<string>();
    for (let current: string | null = id; current !== null && parents.has(current);) {
      if (chain.has(current)) {
        throw new HierarchyError("Cannot purge a branch with a hierarchy cycle.");
      }
      chain.add(current);
      current = parents.get(current) ?? null;
    }
    for (const ancestor of [...chain].reverse()) {
      parents.delete(ancestor);
      parentsFirst.push(ancestor);
    }
  }
  return parentsFirst.reverse();
}
