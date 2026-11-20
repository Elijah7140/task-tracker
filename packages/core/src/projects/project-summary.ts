import type { TodoItem } from "../items/todo-item.js";
import type { EffectiveSettings } from "../settings/effective-settings.js";
import { calculateUrgency } from "../urgency/urgency-calculator.js";
import { UrgencyThresholds } from "../urgency/urgency-thresholds.js";
import type { Project } from "./project.js";

/** The project and its active open and overdue item counts for the home screen. */
export interface ProjectSummary {
  readonly project: Project;
  readonly openCount: number;
  readonly overdueCount: number;
}

/** Count individual items using the same urgency rules as the workspace. */
export function summarizeProject(
  project: Project,
  items: readonly TodoItem[],
  settings: EffectiveSettings,
  now: Temporal.Instant,
  timeZone: string,
): ProjectSummary {
  const thresholds = new UrgencyThresholds(
    settings.urgencyYellowThreshold.value,
    settings.urgencyRedThreshold.value,
  );
  const open = items.filter((item) => item.deletedAtUtc === null && item.completedAtUtc === null);
  const overdue = open.filter(
    (item) => calculateUrgency(item, now, timeZone, thresholds) === "Overdue",
  );
  return { project, openCount: open.length, overdueCount: overdue.length };
}
