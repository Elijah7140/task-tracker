/** Where a dragged row inserts relative to a target sibling row. */
export type DropPlacement = "before" | "after";

/** Vertical bounds of one rendered open sibling row. */
export interface SiblingRowRect {
  readonly id: string;
  readonly top: number;
  readonly height: number;
}

/** Resolved drop target and insertion side for a pointer drag. */
export interface DropTarget {
  readonly targetId: string;
  readonly placement: DropPlacement;
}

/**
 * Exchanges `movedId` with its neighbor at `offset` among visible (open)
 * siblings while leaving finished siblings in their original slots.
 */
export function swapWithVisibleNeighbor(
  allIds: ReadonlyArray<string>,
  visibleIds: ReadonlyArray<string>,
  movedId: string,
  offset: -1 | 1,
): ReadonlyArray<string> | null {
  const index = visibleIds.indexOf(movedId);
  if (index === -1) {
    return null;
  }
  const neighborId = visibleIds[index + offset];
  if (neighborId === undefined) {
    return null;
  }
  const movedSlot = allIds.indexOf(movedId);
  const neighborSlot = allIds.indexOf(neighborId);
  if (movedSlot === -1 || neighborSlot === -1) {
    return null;
  }
  const reordered = [...allIds];
  reordered[movedSlot] = neighborId;
  reordered[neighborSlot] = movedId;
  return reordered;
}

/**
 * Moves `movedId` before or after `targetId` within `visibleIds`, keeping
 * non-visible (finished) siblings in their existing slots in `allIds`.
 */
export function moveAmongVisible(
  allIds: ReadonlyArray<string>,
  visibleIds: ReadonlyArray<string>,
  movedId: string,
  targetId: string,
  placement: DropPlacement,
): ReadonlyArray<string> | null {
  if (movedId === targetId || !visibleIds.includes(movedId) || !visibleIds.includes(targetId)) {
    return null;
  }
  const remaining = visibleIds.filter((id) => id !== movedId);
  const targetIndex = remaining.indexOf(targetId);
  const insertAt = placement === "before" ? targetIndex : targetIndex + 1;
  const nextVisible = [...remaining.slice(0, insertAt), movedId, ...remaining.slice(insertAt)];
  if (nextVisible.every((id, index) => id === visibleIds[index])) {
    return null;
  }
  const visibleSet = new Set(visibleIds);
  let cursor = 0;
  return allIds.map((id) => (visibleSet.has(id) ? nextVisible[cursor++]! : id));
}

/**
 * Chooses `"before"` or `"after"` on `rect` based on drag direction: hitting the
 * exact center moves after when dragging down and before when dragging up.
 */
export function dropPlacement(
  sourceIndex: number,
  targetIndex: number,
  clientY: number,
  rect: Pick<SiblingRowRect, "top" | "height">,
): DropPlacement {
  const center = rect.top + rect.height / 2;
  // Browser pointer coordinates arrive as integer CSS pixels while row bounds can be subpixel.
  const nearCenter = Math.abs(clientY - center) < 1;
  if (sourceIndex < targetIndex) {
    return nearCenter || clientY >= center ? "after" : "before";
  }
  if (sourceIndex > targetIndex) {
    return nearCenter || clientY <= center ? "before" : "after";
  }
  return clientY < center ? "before" : "after";
}

function locateRawTarget(
  siblingRects: ReadonlyArray<SiblingRowRect>,
  sourceIndex: number,
  clientY: number,
): { readonly index: number; readonly placement: DropPlacement } {
  const first = siblingRects[0]!;
  if (clientY <= first.top) {
    return { index: 0, placement: "before" };
  }
  const lastIndex = siblingRects.length - 1;
  const last = siblingRects[lastIndex]!;
  if (clientY >= last.top + last.height) {
    return { index: lastIndex, placement: "after" };
  }
  for (let index = 0; index < siblingRects.length; index += 1) {
    const rect = siblingRects[index]!;
    if (clientY <= rect.top) {
      return { index, placement: "before" };
    }
    if (clientY <= rect.top + rect.height) {
      return { index, placement: dropPlacement(sourceIndex, index, clientY, rect) };
    }
  }
  return { index: lastIndex, placement: "after" };
}

/**
 * Resolves the target sibling and insertion side for `clientY`, returning `null`
 * when dropping at that position would leave the sibling order unchanged.
 */
export function resolveDropTarget(
  siblingRects: ReadonlyArray<SiblingRowRect>,
  sourceId: string,
  clientY: number,
): DropTarget | null {
  const sourceIndex = siblingRects.findIndex((entry) => entry.id === sourceId);
  if (siblingRects.length === 0 || sourceIndex === -1) {
    return null;
  }
  const { index, placement } = locateRawTarget(siblingRects, sourceIndex, clientY);
  if (
    index === sourceIndex ||
    (placement === "before" && index === sourceIndex + 1) ||
    (placement === "after" && index === sourceIndex - 1)
  ) {
    return null;
  }
  return { targetId: siblingRects[index]!.id, placement };
}
