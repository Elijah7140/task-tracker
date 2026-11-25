import type { CompletionResult } from "@task-tracker/contracts";
import { create } from "zustand";

/**
 * Items completed while the user is looking at the current area or drilled-in item.
 * With Auto-hide completed off, these stay in the open list until the user leaves
 * the view or reloads the window (§6.2). The set lives only in this renderer session.
 */
export const useCompletedHereStore = create<{ readonly ids: ReadonlySet<string> }>()(() => ({
  ids: new Set<string>(),
}));

/** Remembers items as completed in the current view. */
export function markCompletedHere(ids: Iterable<string>) {
  const next = new Set(useCompletedHereStore.getState().ids);
  for (const id of ids) {
    next.add(id);
  }
  useCompletedHereStore.setState({ ids: next });
}

/** Forgets an item marked before a completion that did not apply. */
export function forgetCompletedHere(id: string) {
  const { ids } = useCompletedHereStore.getState();
  if (ids.has(id)) {
    const next = new Set(ids);
    next.delete(id);
    useCompletedHereStore.setState({ ids: next });
  }
}

/** Forgets every remembered item, as when the user leaves the view. */
export function clearCompletedHere() {
  if (useCompletedHereStore.getState().ids.size > 0) {
    useCompletedHereStore.setState({ ids: new Set<string>() });
  }
}

/**
 * Remembers everything a completion request completed, including cascaded sub-items and
 * parents, so nothing it touched jumps away. Without an applied result, forgets `itemId`,
 * which the caller marked before sending the request.
 */
export function rememberCompletion(
  itemId: string,
  result: typeof CompletionResult.Type | undefined,
) {
  if (result?.kind !== "applied") {
    forgetCompletedHere(itemId);
    return;
  }
  const completed = result.changes.filter((change) => change.completedAtUtc !== null);
  markCompletedHere(completed.map((change) => change.itemId));
}
