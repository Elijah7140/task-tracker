import { Effect } from "effect";
import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { Urgency } from "../urgency/displayed-urgency.js";
import { effectiveDeadline, urgencyForDeadline } from "../urgency/urgency-calculator.js";
import { SettingsCatalogue } from "../settings/settings-catalogue.js";
import { UrgencyThresholds } from "../urgency/urgency-thresholds.js";

/**
 * Thresholds a loaded entry carries until the service attaches its project's
 * effective values: the application defaults of 3 days and 24 hours.
 */
export const DEFAULT_CALENDAR_THRESHOLDS = new UrgencyThresholds(
  SettingsCatalogue.urgencyYellowThreshold.defaultValue,
  SettingsCatalogue.urgencyRedThreshold.defaultValue,
);

/** A bounded calendar request, optionally limited to one project. */
export interface CalendarQuery {
  readonly projectId: string | null;
  readonly fromDate: Temporal.PlainDate;
  readonly toDateExclusive: Temporal.PlainDate;
  readonly includeCompleted: boolean;
}

/** One item's due date returned by the calendar query. */
export interface CalendarEntry {
  readonly itemId: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly title: string;
  readonly date: Temporal.PlainDate;
  readonly startTime: Temporal.PlainTime | null;
  readonly isCompleted: boolean;
  readonly dueDate: Temporal.PlainDate | null;
  readonly dueTime: Temporal.PlainTime | null;
  readonly itemType: string | null;
  readonly priority: string | null;
  readonly statusId: string | null;
  readonly statusName: string | null;
  readonly priorityLevelId: string | null;
  readonly thresholds: UrgencyThresholds;
}

/** Ensures a calendar query spans at least one day. */
export function validateCalendarRange(
  fromDate: Temporal.PlainDate,
  toDateExclusive: Temporal.PlainDate,
): Effect.Effect<void, MetadataRuleError> {
  if (Temporal.PlainDate.compare(toDateExclusive, fromDate) <= 0) {
    return Effect.fail(new MetadataRuleError("Calendar range must have a positive length."));
  }
  return Effect.void;
}

/**
 * Computes a calendar entry's own urgency from its due date and time, using
 * its project's effective thresholds. A completed entry has none. Urgency is never rolled up from sub-items here (§7.4).
 */
export function calculateCalendarEntryUrgency(
  entry: Pick<CalendarEntry, "isCompleted" | "dueDate" | "dueTime" | "thresholds">,
  now: Temporal.Instant,
  timeZone: string,
): Urgency {
  if (entry.isCompleted) {
    return "None";
  }
  return urgencyForDeadline(effectiveDeadline(entry, timeZone), now, entry.thresholds);
}
