/** Bit flags for the selected days of a Monday-first recurrence week, as legacy stored them. */
export const RecurrenceWeekday = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 4,
  Thursday: 8,
  Friday: 16,
  Saturday: 32,
  Sunday: 64,
} as const;

/** Every valid weekday bit. */
export const ALL_RECURRENCE_WEEKDAYS = 127;

/** Short English day names in Monday-first order. */
export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Whether the Monday-first day index (0 = Monday) is selected in `weekdays`. */
export function includesWeekday(weekdays: number, index: number): boolean {
  return (weekdays & (1 << index)) !== 0;
}

/** The flag for a Temporal day of the week, where Monday is 1 and Sunday is 7. */
export function weekdayFlag(dayOfWeek: number): number {
  return 1 << (dayOfWeek - 1);
}
