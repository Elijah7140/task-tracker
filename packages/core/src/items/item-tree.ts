import { HierarchyError } from "../hierarchy/hierarchy-error.js";
import { Hierarchy } from "../hierarchy/hierarchy.js";
import type { FolderTree } from "../projects/folder-tree.js";
import type { TodoItem } from "./todo-item.js";

/** Owns the active and deleted items of one area. Operations update only this snapshot. */
export class ItemTree {
  readonly #hierarchy: Hierarchy<TodoItem>;

  /** Load all item rows in the area, including deleted rows needed for restore and moves. */
  constructor(
    readonly projectId: string,
    readonly folderId: string | null,
    rows: readonly TodoItem[],
    folders?: FolderTree,
  ) {
    if (folderId !== null) {
      if (folders?.projectId !== projectId) {
        throw new HierarchyError("Area folder is missing or belongs to another project.");
      }
      folders.get(folderId);
    }
    for (const item of rows) {
      this.requireSameArea(item);
    }
    this.#hierarchy = new Hierarchy(rows, (item) => item.parentItemId, "Item");
  }

  /** Active items in the area. */
  get all(): readonly TodoItem[] {
    return this.#hierarchy.all;
  }

  /** All items, including rows retained for restore. */
  get allRows(): readonly TodoItem[] {
    return this.#hierarchy.allRows;
  }

  /** Look up an active item by ID. */
  get(id: string): TodoItem {
    return this.#hierarchy.get(id);
  }

  /** Active children in sibling order. A null parent selects the root items. */
  children(parentId: string | null): readonly TodoItem[] {
    return this.#hierarchy.children(parentId);
  }

  /** Active ancestors, starting with the direct parent. */
  ancestors(id: string): readonly TodoItem[] {
    return this.#hierarchy.ancestors(id);
  }

  /** Active descendants in depth-first sibling order. A null parent walks the whole area. */
  descendants(parentId: string | null): readonly TodoItem[] {
    if (parentId !== null) {
      this.get(parentId);
    }
    return this.#hierarchy.descendants(parentId);
  }

  /** Append a new item to its active siblings. */
  add(item: TodoItem, now: Temporal.Instant): void {
    this.requireSameArea(item);
    this.#hierarchy.add(item, now);
  }

  /** Reparent an item within its area and append it to the destination siblings. */
  move(id: string, parentId: string | null, now: Temporal.Instant): void {
    this.#hierarchy.move({ ...this.get(id), parentItemId: parentId }, now);
  }

  /** Move an item under its preceding sibling. */
  indent(id: string, now: Temporal.Instant): void {
    const siblings = this.children(this.get(id).parentItemId);
    const index = siblings.findIndex((sibling) => sibling.id === id);
    const previous = siblings[index - 1];
    if (previous === undefined) {
      throw new HierarchyError("The first sibling cannot be indented.");
    }
    this.move(id, previous.id, now);
  }

  /** Place an item at an index among the destination siblings, excluding the moved item. */
  moveAt(id: string, parentId: string | null, index: number, now: Temporal.Instant): void {
    const siblings = this.children(parentId)
      .map((sibling) => sibling.id)
      .filter((key) => key !== id);
    if (!Number.isInteger(index) || index < 0 || index > siblings.length) {
      throw new HierarchyError("Item position is outside its siblings.");
    }
    siblings.splice(index, 0, id);
    this.move(id, parentId, now);
    this.reorder(parentId, siblings, now);
  }

  /** Move an item immediately after its parent. */
  outdent(id: string, now: Temporal.Instant): void {
    const parentId = this.get(id).parentItemId;
    if (parentId === null) {
      throw new HierarchyError("A top-level item cannot be outdented.");
    }
    const grandparentId = this.get(parentId).parentItemId;
    const index = this.children(grandparentId).findIndex((sibling) => sibling.id === parentId);
    this.moveAt(id, grandparentId, index + 1, now);
  }

  /** Move a root and every descendant, including deleted rows, to another area in the project. */
  moveTopLevelTo(id: string, destination: ItemTree, now: Temporal.Instant): void {
    const root = this.get(id);
    if (
      root.parentItemId !== null ||
      destination.projectId !== this.projectId ||
      destination.folderId === this.folderId
    ) {
      throw new HierarchyError(
        "Only a top-level item can move to another area in the same project.",
      );
    }
    this.#hierarchy.transferRoot(
      root,
      destination.#hierarchy,
      (item) => ({ ...item, folderId: destination.folderId, updatedAtUtc: now }),
      now,
    );
  }

  /** Set the order of every active sibling under one parent. */
  reorder(parentId: string | null, ids: readonly string[], now: Temporal.Instant): void {
    this.#hierarchy.reorder(parentId, ids, now);
  }

  /** Delete the active item branch with one batch, retaining earlier deletion batches. */
  deleteSubtree(id: string, batchId: string, now: Temporal.Instant): void {
    this.#hierarchy.deleteSubtree(id, batchId, now);
  }

  /** Restore exactly one batch and return its item IDs. All external parents must be active. */
  restoreBatch(batchId: string, now: Temporal.Instant): readonly string[] {
    return this.#hierarchy.restoreBatch(batchId, now);
  }

  private requireSameArea(item: TodoItem): void {
    if (item.projectId !== this.projectId || item.folderId !== this.folderId) {
      throw new HierarchyError("Item belongs to another area.");
    }
  }
}
