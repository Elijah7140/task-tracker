import { HierarchyError } from "../hierarchy/hierarchy-error.js";
import { Hierarchy } from "../hierarchy/hierarchy.js";
import type { Folder } from "./folder.js";

/** Owns the active and deleted folders of one project. Operations update only this snapshot. */
export class FolderTree {
  readonly #hierarchy: Hierarchy<Folder>;

  /** Load all folder rows in the project, including deleted folders needed for batch restores. */
  constructor(
    readonly projectId: string,
    rows: readonly Folder[],
  ) {
    if (rows.some((folder) => folder.projectId !== projectId)) {
      throw new HierarchyError("Folder belongs to another project.");
    }
    this.#hierarchy = new Hierarchy(rows, (folder) => folder.parentFolderId, "Folder");
  }

  /** Active folders in the project. */
  get all(): readonly Folder[] {
    return this.#hierarchy.all;
  }

  /** All folders, including rows retained for restore. */
  get allRows(): readonly Folder[] {
    return this.#hierarchy.allRows;
  }

  /** Look up an active folder by ID. */
  get(id: string): Folder {
    return this.#hierarchy.get(id);
  }

  /** Active children in sibling order. A null parent selects the root folders. */
  children(parentId: string | null): readonly Folder[] {
    return this.#hierarchy.children(parentId);
  }

  /** Active ancestors, starting with the direct parent. */
  ancestors(id: string): readonly Folder[] {
    return this.#hierarchy.ancestors(id);
  }

  /** Active descendants in depth-first sibling order. */
  descendants(id: string): readonly Folder[] {
    this.get(id);
    return this.#hierarchy.descendants(id);
  }

  /** Append a new folder to its active siblings. */
  add(folder: Folder, now: Temporal.Instant): void {
    if (folder.projectId !== this.projectId) {
      throw new HierarchyError("Folder belongs to another project.");
    }
    this.#hierarchy.add(folder, now);
  }

  /** Reparent a folder within the project and append it to the destination siblings. */
  move(id: string, parentId: string | null, now: Temporal.Instant): void {
    this.#hierarchy.move({ ...this.get(id), parentFolderId: parentId }, now);
  }

  /** Set the order of every active sibling under one parent. */
  reorder(parentId: string | null, ids: readonly string[], now: Temporal.Instant): void {
    this.#hierarchy.reorder(parentId, ids, now);
  }

  /** Delete the active folder branch with one batch, retaining earlier deletion batches. */
  deleteSubtree(id: string, batchId: string, now: Temporal.Instant): void {
    this.#hierarchy.deleteSubtree(id, batchId, now);
  }

  /** Restore exactly one batch and return its folder IDs. All external parents must be active. */
  restoreBatch(batchId: string, now: Temporal.Instant): readonly string[] {
    return this.#hierarchy.restoreBatch(batchId, now);
  }
}
