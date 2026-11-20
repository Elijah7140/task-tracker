/** Neutral empty-time placeholder for 12-hour clocks (never shows the current AM/PM). */
export const EMPTY_TIME_12H = "--:-- --";

/** Neutral empty-time placeholder for 24-hour clocks (no period column). */
export const EMPTY_TIME_24H = "--:--";

/**
 * Returns the neutral empty-time placeholder matching a locale's clock cycle:
 * `"--:-- --"` for 12-hour clocks and `"--:--"` for 24-hour clocks.
 */
export function emptyTimePlaceholder(
  locale?: string,
): typeof EMPTY_TIME_12H | typeof EMPTY_TIME_24H {
  const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
  return cycle === "h11" || cycle === "h12" ? EMPTY_TIME_12H : EMPTY_TIME_24H;
}
