import { EntityMissing } from "../entity-missing.js";
import type { DeletionFields } from "./deletion-fields.js";
import { HierarchyError } from "./hierarchy-error.js";

interface Row extends DeletionFields {
  readonly id: string;
  readonly sortOrder: number;
  readonly updatedAtUtc: Temporal.Instant;
}

/** Shared in-memory row storage, navigation, ordering and batch rules for a validated scope. */
export class Hierarchy<Entity extends Row> {
  readonly #rows = new Map<string, Entity>();

  constructor(
    rows: readonly Entity[],
    private readonly parentIdOf: (row: Entity) => string | null,
    private readonly kind: "Folder" | "Item",
  ) {
    for (const row of rows) {
      this.requireAbsent(row.id);
      this.#rows.set(row.id, row);
    }
    this.validateLoadedParents();
  }

  get allRows(): readonly Entity[] {
    return [...this.#rows.values()];
  }

  get all(): readonly Entity[] {
    return this.allRows.filter((row) => row.deletedAtUtc === null);
  }

  get(id: string): Entity {
    const row = this.#rows.get(id);
    if (row === undefined || row.deletedAtUtc !== null) {
      throw new EntityMissing(this.kind);
    }
    return row;
  }

  children(parentId: string | null): readonly Entity[] {
    return this.all
      .filter((row) => this.parentIdOf(row) === parentId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  ancestors(id: string): readonly Entity[] {
    const ancestors: Entity[] = [];
    let parentId = this.parentIdOf(this.get(id));
    while (parentId !== null) {
      const parent = this.get(parentId);
      ancestors.push(parent);
      parentId = this.parentIdOf(parent);
    }
    return ancestors;
  }

  descendants(parentId: string | null, includeDeleted = false): readonly Entity[] {
    const sorted = [...(includeDeleted ? this.allRows : this.all)].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
    const byParent = Map.groupBy(sorted, this.parentIdOf);
    const pending = (byParent.get(parentId) ?? []).toReversed();
    const descendants: Entity[] = [];

    for (let row = pending.pop(); row !== undefined; row = pending.pop()) {
      descendants.push(row);
      const children = byParent.get(row.id) ?? [];
      pending.push(...children.toReversed());
    }
    return descendants;
  }

  add(row: Entity, now: Temporal.Instant): void {
    this.requireAbsent(row.id);
    if (row.deletedAtUtc !== null) {
      throw new HierarchyError(`Cannot add a deleted ${this.kind.toLowerCase()} as active.`);
    }
    this.requireActiveParent(this.parentIdOf(row));
    this.append(row, now);
  }

  /** Replace an active row's own fields, keeping its parent and position. */
  replace(row: Entity): void {
    const current = this.get(row.id);
    if (this.parentIdOf(current) !== this.parentIdOf(row) || current.sortOrder !== row.sortOrder) {
      throw new HierarchyError(`${this.kind} replacement cannot move it.`);
    }
    if (row.deletedAtUtc !== null) {
      throw new HierarchyError(`${this.kind} replacement cannot delete it.`);
    }
    this.#rows.set(row.id, row);
  }

  move(row: Entity, now: Temporal.Instant): void {
    const oldParentId = this.parentIdOf(this.get(row.id));
    const parentId = this.parentIdOf(row);
    if (
      parentId !== null &&
      (parentId === row.id || this.ancestors(parentId).some((ancestor) => ancestor.id === row.id))
    ) {
      throw new HierarchyError(`${this.kind} move would create a cycle.`);
    }
    this.append(row, now);
    if (oldParentId !== parentId) {
      this.renumber(this.children(oldParentId), now);
    }
  }

  /** Transfer a validated root branch after checking every destination ID. */
  transferRoot(
    root: Entity,
    destination: Hierarchy<Entity>,
    relocate: (row: Entity) => Entity,
    now: Temporal.Instant,
  ): void {
    const movedRoot = relocate(root);
    const branch = [movedRoot, ...this.descendants(root.id, true).map(relocate)];
    for (const row of branch) {
      destination.requireAbsent(row.id);
    }
    for (const row of branch) {
      this.#rows.delete(row.id);
      destination.#rows.set(row.id, row);
    }

    destination.append(movedRoot, now);
    this.renumber(this.children(null), now);
  }

  reorder(parentId: string | null, ids: readonly string[], now: Temporal.Instant): void {
    this.requireActiveParent(parentId);
    const siblings = this.children(parentId);
    const idsInOrder = new Set(ids);
    if (
      ids.length !== siblings.length ||
      idsInOrder.size !== siblings.length ||
      siblings.some((sibling) => !idsInOrder.has(sibling.id))
    ) {
      throw new HierarchyError("Order must contain every sibling exactly once.");
    }
    this.renumber(
      ids.map((id) => this.get(id)),
      now,
    );
  }

  deleteSubtree(id: string, batchId: string, now: Temporal.Instant): void {
    const root = this.get(id);
    const branch = [root, ...this.descendants(id)];
    for (const row of branch) {
      this.#rows.set(row.id, {
        ...row,
        deletedAtUtc: now,
        deletionBatchId: batchId,
        updatedAtUtc: now,
      });
    }
    this.renumber(this.children(this.parentIdOf(root)), now);
  }

  restoreBatch(batchId: string, now: Temporal.Instant): readonly string[] {
    const branch = this.allRows.filter(
      (row) => row.deletedAtUtc !== null && row.deletionBatchId === batchId,
    );
    if (branch.length === 0) {
      throw new EntityMissing("DeletionBatch", `${this.kind} deletion batch was not found.`);
    }

    this.validateRestore(branch);
    for (const row of branch) {
      this.#rows.set(row.id, {
        ...row,
        deletedAtUtc: null,
        deletionBatchId: null,
        updatedAtUtc: now,
      });
    }
    const parentIds = new Set(branch.map(this.parentIdOf));
    for (const parentId of parentIds) {
      this.renumber(this.children(parentId), now);
    }
    return branch.map((row) => row.id);
  }

  private requireAbsent(id: string): void {
    if (this.#rows.has(id)) {
      throw new HierarchyError(`Duplicate ${this.kind.toLowerCase()}.`);
    }
  }

  private requireActiveParent(parentId: string | null): void {
    if (parentId !== null) {
      this.get(parentId);
    }
  }

  private append(row: Entity, now: Temporal.Instant): void {
    const siblings = this.children(this.parentIdOf(row)).filter((sibling) => sibling.id !== row.id);
    this.renumber([...siblings, row], now);
  }

  private renumber(rows: readonly Entity[], now: Temporal.Instant): void {
    rows.forEach((row, sortOrder) => {
      this.#rows.set(row.id, { ...row, sortOrder, updatedAtUtc: now });
    });
  }

  private validateRestore(branch: readonly Entity[]): void {
    const branchIds = new Set(branch.map((row) => row.id));
    for (const row of branch) {
      const parentId = this.parentIdOf(row);
      if (
        parentId !== null &&
        !branchIds.has(parentId) &&
        this.#rows.get(parentId)?.deletedAtUtc !== null
      ) {
        throw new HierarchyError(`Restore the parent ${this.kind.toLowerCase()} first.`);
      }
    }
  }

  private validateLoadedParents(): void {
    for (const row of this.#rows.values()) {
      const parentId = this.parentIdOf(row);
      if (parentId === null) {
        continue;
      }

      const parent = this.#rows.get(parentId);
      if (parent === undefined || (row.deletedAtUtc === null && parent.deletedAtUtc !== null)) {
        throw new HierarchyError(`${this.kind} parent is missing or deleted.`);
      }
    }

    const validated = new Set<string>();
    for (const row of this.#rows.values()) {
      this.validateAcyclicPath(row, validated);
    }
  }

  private validateAcyclicPath(row: Entity, validated: Set<string>): void {
    const path = new Set<string>();
    let current: Entity | undefined = row;
    while (current !== undefined && !validated.has(current.id)) {
      if (path.has(current.id)) {
        throw new HierarchyError(`${this.kind} cycle detected.`);
      }
      path.add(current.id);
      const parentId = this.parentIdOf(current);
      current = parentId === null ? undefined : this.#rows.get(parentId);
    }
    for (const id of path) {
      validated.add(id);
    }
  }
}
