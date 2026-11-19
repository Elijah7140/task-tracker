/** Minimal lookup shape needed for partitioning and reorder calculations. */
export interface OrderedLookup {
  readonly id: string;
  readonly isArchived: boolean;
  readonly sortOrder: number;
}

/** Splits lookup rows into sorted active and archived lists. */
export function partitionLookups<Row extends OrderedLookup>(rows: ReadonlyArray<Row>) {
  const sorted = rows.toSorted((left, right) => left.sortOrder - right.sortOrder);
  const active: Array<Row> = [];
  const archived: Array<Row> = [];
  for (const row of sorted) {
    if (row.isArchived) {
      archived.push(row);
    } else {
      active.push(row);
    }
  }
  return { active, archived };
}

function swapIds<Row extends OrderedLookup>(
  rows: ReadonlyArray<Row>,
  firstId: string,
  secondId: string,
): ReadonlyArray<string> {
  const sorted = rows.toSorted((left, right) => left.sortOrder - right.sortOrder);
  const ids = sorted.map((row) => row.id);
  const firstIndex = ids.indexOf(firstId);
  const secondIndex = ids.indexOf(secondId);
  if (firstIndex < 0 || secondIndex < 0) {
    return ids;
  }
  const next = [...ids];
  next[firstIndex] = ids[secondIndex]!;
  next[secondIndex] = ids[firstIndex]!;
  return next;
}

/**
 * Moves one active lookup up (`-1`) or down (`1`) among active rows while
 * keeping every lookup ID (including archived rows) in the complete order.
 */
export function swapActiveLookup<Row extends OrderedLookup>(
  rows: ReadonlyArray<Row>,
  id: string,
  direction: -1 | 1,
): ReadonlyArray<string> | null {
  const { active } = partitionLookups(rows);
  const index = active.findIndex((row) => row.id === id);
  const neighborIndex = index + direction;
  const neighbor = active[neighborIndex];
  if (index < 0 || neighbor === undefined) {
    return null;
  }
  return swapIds(rows, id, neighbor.id);
}

/**
 * Reorders `draggedId` to `targetId`'s active slot, preserving every archived
 * row at its existing position in the complete ID order.
 */
export function moveActiveLookup<Row extends OrderedLookup>(
  rows: ReadonlyArray<Row>,
  draggedId: string,
  targetId: string,
): ReadonlyArray<string> | null {
  if (draggedId === targetId) {
    return null;
  }
  const sorted = rows.toSorted((left, right) => left.sortOrder - right.sortOrder);
  const active = sorted.filter((row) => !row.isArchived);
  const fromIndex = active.findIndex((row) => row.id === draggedId);
  const toIndex = active.findIndex((row) => row.id === targetId);
  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }
  const reorderedActive = [...active];
  const [moved] = reorderedActive.splice(fromIndex, 1);
  reorderedActive.splice(toIndex, 0, moved!);
  let activeCursor = 0;
  return sorted.map((row) => {
    if (row.isArchived) {
      return row.id;
    }
    const replacement = reorderedActive[activeCursor]!;
    activeCursor += 1;
    return replacement.id;
  });
}
