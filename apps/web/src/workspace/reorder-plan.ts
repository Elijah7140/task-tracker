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
  placement: "before" | "after",
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
