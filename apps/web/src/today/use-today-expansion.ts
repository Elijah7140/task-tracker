import type { TodayRow, TodaySnapshot } from "@task-tracker/contracts";
import { useCallback, useState } from "react";

type Snapshot = typeof TodaySnapshot.Type;
type Row = typeof TodayRow.Type;

function completedRowIds(snapshot: Snapshot): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (rows: ReadonlyArray<Row>) => {
    for (const row of rows) {
      if (row.state !== "open") {
        ids.add(row.itemId);
      }
      visit(row.children);
    }
  };
  snapshot.projects.forEach((project) => project.areas.forEach((area) => visit(area.rows)));
  return ids;
}

/** Keeps the choices for rows that are still completed and drops the rest. */
function keepCompletedChoices(choices: ReadonlyMap<string, boolean>, snapshot: Snapshot) {
  const completed = completedRowIds(snapshot);
  return new Map([...choices].filter(([itemId]) => completed.has(itemId)));
}

/**
 * Expansion on the Today page (§7.14). Open context rows start expanded and
 * completed parents collapsed. Completed rows keep the user's choice while
 * they stay completed in the view; a refresh resets every other row.
 */
export function useTodayExpansion(snapshot: Snapshot | null) {
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [shown, setShown] = useState(snapshot);
  if (snapshot !== shown) {
    setShown(snapshot);
    if (snapshot !== null) {
      setChoices((current) => keepCompletedChoices(current, snapshot));
    }
  }

  const isExpanded = useCallback(
    (row: Row) => choices.get(row.itemId) ?? row.state === "open",
    [choices],
  );
  const setExpanded = useCallback((row: Row, expanded: boolean) => {
    setChoices((current) => new Map(current).set(row.itemId, expanded));
  }, []);
  return { isExpanded, setExpanded };
}
