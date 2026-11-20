import { ALL_RECURRENCE_WEEKDAYS, includesWeekday, WEEKDAY_NAMES } from "./recurrence-weekday.js";

/** The calendar unit used to advance an occurrence. */
export type RecurrenceFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";

/** The date the rule advances from: the due date or the local completion day (§7.11). */
export type RecurrenceAnchor = "DueDate" | "CompletionDate";

/** How a repeat stops generating occurrences. */
export type RecurrenceEndKind = "Never" | "OnDate" | "AfterCount";

/** Every frequency in legacy storage order. */
export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  "Daily",
  "Weekly",
  "Monthly",
  "Yearly",
];

/** Every anchor in legacy storage order. */
export const RECURRENCE_ANCHORS: readonly RecurrenceAnchor[] = ["DueDate", "CompletionDate"];

/** Every end kind in legacy storage order. */
export const RECURRENCE_END_KINDS: readonly RecurrenceEndKind[] = ["Never", "OnDate", "AfterCount"];

/**
 * The schedule and end condition of a repeating item (§7.11). `weekdays` holds
 * Monday-first bit flags, `monthDay` 0 means the last day of the month, and
 * `remaining` counts the current occurrence.
 */
export interface RecurrenceRule {
  readonly frequency: RecurrenceFrequency;
  readonly interval: number;
  readonly weekdays: number | null;
  readonly monthDay: number | null;
  readonly month: number | null;
  readonly anchor: RecurrenceAnchor;
  readonly endKind: RecurrenceEndKind;
  readonly endDate: Temporal.PlainDate | null;
  readonly remaining: number | null;
}

/** A rule property and the message to show for it. */
export interface RecurrenceError {
  readonly property: keyof RecurrenceRule;
  readonly message: string;
}

/** Builds a rule with the legacy defaults: every 1, from the due date, never ending. */
export function recurrenceRule(
  frequency: RecurrenceFrequency,
  options: Partial<Omit<RecurrenceRule, "frequency">> = {},
): RecurrenceRule {
  return {
    frequency,
    interval: 1,
    weekdays: null,
    monthDay: null,
    month: null,
    anchor: "DueDate",
    endKind: "Never",
    endDate: null,
    remaining: null,
    ...options,
  };
}

/** Every invalid property, in the order legacy reported them. */
export function recurrenceErrors(rule: RecurrenceRule): readonly RecurrenceError[] {
  return [...basicErrors(rule), ...patternErrors(rule), ...endErrors(rule)];
}

/** The first error to show in the editor or a domain operation, or null for a valid rule. */
export function findRecurrenceError(rule: RecurrenceRule): RecurrenceError | null {
  return recurrenceErrors(rule)[0] ?? null;
}

function basicErrors(rule: RecurrenceRule): RecurrenceError[] {
  const errors: RecurrenceError[] = [];
  if (!RECURRENCE_FREQUENCIES.includes(rule.frequency)) {
    errors.push({ property: "frequency", message: "Choose a repeat frequency." });
  }
  if (!isWholeNumber(rule.interval, 1)) {
    errors.push({ property: "interval", message: "Repeat interval must be positive." });
  }
  if (!RECURRENCE_ANCHORS.includes(rule.anchor)) {
    errors.push({ property: "anchor", message: "Choose a repeat anchor." });
  }
  return errors;
}

function patternErrors(rule: RecurrenceRule): RecurrenceError[] {
  const errors: RecurrenceError[] = [];
  const weekly = rule.frequency === "Weekly";
  if (weekly ? !validWeekdays(rule.weekdays) : rule.weekdays !== null) {
    const message = "Choose at least one valid weekday for weekly repeats only.";
    errors.push({ property: "weekdays", message });
  }
  const validMonth = isWholeNumber(rule.month, 1, 12);
  if (rule.frequency === "Yearly" ? !validMonth : rule.month !== null) {
    const message = "A valid month is required for yearly repeats only.";
    errors.push({ property: "month", message });
  }
  if (!validMonthDay(rule, validMonth)) {
    errors.push({ property: "monthDay", message: "Choose a valid day for the repeat frequency." });
  }
  return errors;
}

function validWeekdays(weekdays: number | null): boolean {
  return (
    weekdays !== null && isWholeNumber(weekdays, 1) && (weekdays & ~ALL_RECURRENCE_WEEKDAYS) === 0
  );
}

function validMonthDay(rule: RecurrenceRule, validMonth: boolean): boolean {
  const { frequency, monthDay, month } = rule;
  if (frequency === "Monthly") {
    return isWholeNumber(monthDay, 0, 31);
  }
  if (frequency !== "Yearly") {
    return monthDay === null;
  }
  const lastDay = validMonth
    ? Temporal.PlainYearMonth.from({ year: 2000, month: month! }).daysInMonth
    : 31;
  return isWholeNumber(monthDay, 1, lastDay);
}

function endErrors(rule: RecurrenceRule): RecurrenceError[] {
  if (!RECURRENCE_END_KINDS.includes(rule.endKind)) {
    return [{ property: "endKind", message: "Choose how the repeat ends." }];
  }
  const errors: RecurrenceError[] = [];
  if ((rule.endKind === "OnDate") !== (rule.endDate !== null)) {
    const message = "An end date is required only when the repeat ends on a date.";
    errors.push({ property: "endDate", message });
  }
  const counted = rule.endKind === "AfterCount";
  if (counted ? !isWholeNumber(rule.remaining, 1) : rule.remaining !== null) {
    const message = "A positive occurrence count is required only for a count limit.";
    errors.push({ property: "remaining", message });
  }
  return errors;
}

function isWholeNumber(
  value: number | null,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): boolean {
  return value !== null && Number.isInteger(value) && value >= minimum && value <= maximum;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Describes the pattern in plain English, such as "Every 2 weeks on Mon, Thu". */
export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case "Daily":
      return describeInterval(rule, "Daily", "days");
    case "Weekly":
      return `${describeInterval(rule, "Weekly", "weeks")} on ${describeWeekdays(rule)}`;
    case "Monthly":
      return `${describeInterval(rule, "Monthly", "months")} on ${describeMonthDay(rule)}`;
    case "Yearly":
      return `${describeInterval(rule, "Every year", "years")} on ${describeYearDay(rule)}`;
  }
}

function describeInterval(rule: RecurrenceRule, single: string, plural: string): string {
  return rule.interval === 1 ? single : `Every ${rule.interval} ${plural}`;
}

function describeWeekdays(rule: RecurrenceRule): string {
  const weekdays = rule.weekdays ?? 0;
  return WEEKDAY_NAMES.filter((_name, index) => includesWeekday(weekdays, index)).join(", ");
}

function describeMonthDay(rule: RecurrenceRule): string {
  return rule.monthDay === 0 ? "the last day" : `day ${rule.monthDay}`;
}

function describeYearDay(rule: RecurrenceRule): string {
  return `${rule.monthDay} ${MONTH_NAMES[(rule.month ?? 1) - 1]}`;
}

/** Whether two optional rules have the same values, comparing end dates by calendar day. */
export function sameRecurrence(left: RecurrenceRule | null, right: RecurrenceRule | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  const sameEnd =
    left.endDate === null || right.endDate === null
      ? left.endDate === right.endDate
      : left.endDate.equals(right.endDate);
  return (
    sameEnd &&
    left.frequency === right.frequency &&
    left.interval === right.interval &&
    left.weekdays === right.weekdays &&
    left.monthDay === right.monthDay &&
    left.month === right.month &&
    left.anchor === right.anchor &&
    left.endKind === right.endKind &&
    left.remaining === right.remaining
  );
}
