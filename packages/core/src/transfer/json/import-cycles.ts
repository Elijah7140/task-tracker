/** True when following parent links from `document` leads back to it or round in a loop. */
export function formsCycle<T>(
  document: T,
  byId: ReadonlyMap<string, T>,
  idOf: (value: T) => string | null,
  parentOf: (value: T) => string | null,
): boolean {
  const seen = new Set<string>();
  let current = document;
  for (;;) {
    const parentId = parentOf(current);
    const parent = parentId === null ? undefined : byId.get(parentId);
    if (parentId === null || parent === undefined) {
      return false;
    }
    if (idOf(parent) === idOf(document) || seen.has(parentId)) {
      return true;
    }
    seen.add(parentId);
    current = parent;
  }
}

/** Maps documents by id, keeping the first of any duplicates. */
export function firstById<T extends { readonly id: string | null }>(
  documents: readonly T[],
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const document of documents) {
    if (document.id !== null && !byId.has(document.id)) {
      byId.set(document.id, document);
    }
  }
  return byId;
}
