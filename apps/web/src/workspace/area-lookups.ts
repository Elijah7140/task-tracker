import type { AreaSnapshot } from "@task-tracker/contracts";
import { findItemTitle } from "./item-outline.js";
import type { ItemRowLookups } from "./item-parts.js";

/** The names and zone an area's cards and rows resolve their references with. */
export function lookupsFor(snapshot: typeof AreaSnapshot.Type, timeZone: string): ItemRowLookups {
  const priorities = new Map(snapshot.priorityLevels.map((level) => [level.id, level.label]));
  return {
    priorityLevels: snapshot.priorityLevels,
    statuses: snapshot.statuses,
    priorityName: (levelId) => (levelId === null ? null : (priorities.get(levelId) ?? null)),
    itemTitle: (itemId) => findItemTitle(snapshot.items, itemId),
    timeZone,
  };
}
