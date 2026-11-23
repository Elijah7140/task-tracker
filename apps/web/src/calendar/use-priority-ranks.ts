import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useMemo } from "react";
import { priorityLevelsAtom } from "../rpc/lookup-queries.js";

/**
 * Each priority level's rank, 0 for the most important, from the level order in
 * App Settings (§5). Calendar days list their entries in this order (§7.4).
 */
export function usePriorityRanks(): ReadonlyMap<string, number> {
  const levels = useAtomValue(priorityLevelsAtom);
  return useMemo(() => {
    const list = AsyncResult.isSuccess(levels) ? levels.value : [];
    const ordered = list.toSorted((left, right) => left.sortOrder - right.sortOrder);
    return new Map(ordered.map((level, index) => [level.id, index]));
  }, [levels]);
}
