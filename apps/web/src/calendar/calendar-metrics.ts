/** Height of one hour in the week time grid, in CSS pixels (§7.4). */
export const HOUR_HEIGHT = 48;

/** Height of a full 00:00–24:00 day column in CSS pixels. */
export const DAY_HEIGHT = HOUR_HEIGHT * 24;

/** Vertical pixels for one minute of a timed entry. */
export const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;

/** Total minutes in one day column. */
export const DAY_MINUTES = 24 * 60;

/** Duration in minutes of a timed due marker in the week grid. */
export const DUE_MARKER_MINUTES = 30;

/** Entries shorter than this render urgency label and title on one compact line (§7.4). */
export const TWO_LINE_HEIGHT = 40;

/** Hour the week view scrolls to when opened (§7.4). */
export const MORNING_HOUR = 7;

/** Scroll offset in pixels that places 07:00 at the top of the week grid. */
export const MORNING_OFFSET = MORNING_HOUR * HOUR_HEIGHT;

/** Maximum entries listed inside a month cell before "+N more" (§7.4). */
export const MAX_VISIBLE_MONTH_ENTRIES = 3;

/** Number of days shown in a six-week month grid. */
export const MONTH_DAY_COUNT = 42;

/** Number of days shown in a week grid. */
export const WEEK_DAY_COUNT = 7;

/** Row labels of the 00:00–23:00 time grid. */
export const HOUR_LABELS: ReadonlyArray<string> = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`,
);
