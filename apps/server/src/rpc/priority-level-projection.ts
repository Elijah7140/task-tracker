import type { PriorityLevelProjection } from "@task-tracker/contracts";
import { priorityLabel, type PriorityLevel } from "@task-tracker/core";

/** Exposes the stored number and its display label consistently on all item surfaces. */
export function projectPriorityLevel(level: PriorityLevel): typeof PriorityLevelProjection.Type {
  return { ...level, label: priorityLabel(level) };
}
