import { Effect } from "effect";
import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { Urgency } from "../urgency/displayed-urgency.js";
import { effectiveDeadline, urgencyForDeadline } from "../urgency/urgency-calculator.js";
import { SettingsCatalogue } from "../settings/settings-catalogue.js";
import { UrgencyThresholds } from "../urgency/urgency-thresholds.js";

/** Why an item appears on the calendar. */
export type CalendarEntryKind = "due" | "scheduled";

/** Length in minutes of a scheduled block with no usable end, and of timed due markers. */
export const DEFAULT_CALENDAR_BLOCK_MINUTES = 30;

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

/** One due date or scheduled block returned by the calendar query. */
export interface CalendarEntry {
  readonly itemId: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly title: string;
  readonly kind: CalendarEntryKind;
  readonly date: Temporal.PlainDate;
  readonly startTime: Temporal.PlainTime | null;
  readonly scheduledStart: Temporal.PlainDateTime | null;
  readonly scheduledEnd: Temporal.PlainDateTime | null;
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

/**
 * The end of a scheduled block. A missing end, or an end that is not after the
 * start, gives a block of {@link DEFAULT_CALENDAR_BLOCK_MINUTES} minutes.
 */
export function effectiveScheduledEnd(
  scheduledStart: Temporal.PlainDateTime | null,
  scheduledEnd: Temporal.PlainDateTime | null,
): Temporal.PlainDateTime | null {
  if (scheduledStart === null) {
    return null;
  }
  if (scheduledEnd !== null && Temporal.PlainDateTime.compare(scheduledEnd, scheduledStart) > 0) {
    return scheduledEnd;
  }
  return scheduledStart.add({ minutes: DEFAULT_CALENDAR_BLOCK_MINUTES });
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
 * Computes a calendar entry's own urgency from its due date, else its
 * scheduled start, using its project's effective thresholds. A completed
 * entry has none. Urgency is never rolled up from sub-items here (§7.4).
 */
export function calculateCalendarEntryUrgency(
  entry: Pick<
    CalendarEntry,
    "isCompleted" | "dueDate" | "dueTime" | "scheduledStart" | "thresholds"
  >,
  now: Temporal.Instant,
  timeZone: string,
): Urgency {
  if (entry.isCompleted) {
    return "None";
  }
  return urgencyForDeadline(effectiveDeadline(entry, timeZone), now, entry.thresholds);
}
