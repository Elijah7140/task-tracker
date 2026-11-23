import { toFloating } from "../time/floating-time.js";
import {
  type DeadlineFields,
  effectiveDeadline,
  isOverdue,
} from "../urgency/urgency-calculator.js";
import type { Project } from "./project.js";

/** The project and its active open and overdue item counts for the home screen. */
export interface ProjectSummary {
  readonly project: Project;
  readonly openCount: number;
  readonly overdueCount: number;
}

/**
 * The first local date whose deadlines cannot be overdue at `now`. An overdue
 * deadline falls on today's local date or earlier, and the extra day keeps the
 * bound safe across zone transitions. Stored dates below it are the only ones
 * the summary needs to load.
 */
export function overdueDateBound(now: Temporal.Instant, timeZone: string): Temporal.PlainDate {
  return toFloating(now, timeZone).toPlainDate().add({ days: 2 });
}

/**
 * Summarize a project from its open item count and the deadlines of open items
 * that might be overdue. Overdue follows the workspace's urgency rule (§6.3).
 */
export function summarizeProject(
  project: Project,
  openCount: number,
  openDeadlines: readonly DeadlineFields[],
  now: Temporal.Instant,
  timeZone: string,
): ProjectSummary {
  const overdue = openDeadlines.filter((fields) =>
    isOverdue(effectiveDeadline(fields, timeZone), now),
  );
  return { project, openCount, overdueCount: overdue.length };
}
