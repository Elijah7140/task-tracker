import { create } from "zustand";

const STORAGE_KEY = "task-tracker.expanded-card-details";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function readStoredIds(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter(isString) : []);
  } catch {
    return new Set();
  }
}

function storeIds(ids: ReadonlySet<string>) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage can be unavailable. The choice then lasts while the window is open.
  }
}

/**
 * The in-progress cards whose ticket Detail the user expanded past two lines (§7.18).
 * A card stays expanded until the user collapses it. The set lives in local storage, so
 * the tray card and its popped-out window share it and it outlasts hiding either one.
 */
export const useExpandedDetailsStore = create<{ readonly ids: ReadonlySet<string> }>()(() => ({
  ids: readStoredIds(),
}));

function replaceIds(ids: ReadonlySet<string>) {
  useExpandedDetailsStore.setState({ ids });
  storeIds(ids);
}

/** Expands or collapses an item's Detail on its in-progress card. */
export function setDetailExpanded(itemId: string, expanded: boolean) {
  const { ids } = useExpandedDetailsStore.getState();
  if (ids.has(itemId) === expanded) {
    return;
  }
  const next = new Set(ids);
  if (expanded) {
    next.add(itemId);
  } else {
    next.delete(itemId);
  }
  replaceIds(next);
}

/** Forgets expanded items that are no longer in progress, so the stored set stays small. */
export function keepExpandedDetails(itemIds: Iterable<string>) {
  const { ids } = useExpandedDetailsStore.getState();
  const kept = new Set([...itemIds].filter((id) => ids.has(id)));
  if (kept.size !== ids.size) {
    replaceIds(kept);
  }
}

/**
 * Follows changes the other in-progress window stores, so expanding a card in the
 * pop-out also shows it expanded in the tray card. Returns the unsubscribe.
 */
export function followExpandedDetails(): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      useExpandedDetailsStore.setState({ ids: readStoredIds() });
    }
  };
  globalThis.addEventListener("storage", onStorage);
  return () => globalThis.removeEventListener("storage", onStorage);
}
