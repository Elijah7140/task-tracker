import { useState } from "react";

/**
 * Roving focus for a composite widget such as a tree: one item is in the tab
 * order at a time. It follows the focused item, and starts at `fallbackId`
 * (for example the current or selected item) until the user focuses another.
 * An ID that is no longer rendered falls back again.
 */
export function useRovingFocus(fallbackId: string | null, renderedIds: ReadonlySet<string>) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabStopId = focusedId !== null && renderedIds.has(focusedId) ? focusedId : fallbackId;
  return {
    tabIndexFor: (id: string) => (id === tabStopId ? 0 : -1),
    onItemFocus: (id: string) => setFocusedId(id),
  };
}
