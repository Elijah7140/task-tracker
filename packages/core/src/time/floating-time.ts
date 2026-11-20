const endOfDay = Temporal.PlainTime.from("23:59:59.9999999");

/** Resolve a floating local date-time in the supplied zone. */
export function toUtc(local: Temporal.PlainDateTime, timeZone: string): Temporal.Instant {
  const earlier = local.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  if (earlier.toPlainDateTime().equals(local)) {
    return earlier.toInstant();
  }

  // In a gap, "earlier" shifted the wall time back before the transition.
  const transition = earlier.getTimeZoneTransition("next");
  if (transition === null) {
    throw new RangeError("Expected a time zone transition after the start of the gap.");
  }
  return transition.toInstant();
}

/** Resolve a due date and optional wall time, defaulting to the last legacy tick of the day. */
export function dueToUtc(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime | null,
  timeZone: string,
): Temporal.Instant {
  return toUtc(date.toPlainDateTime(time ?? endOfDay), timeZone);
}

/** The wall-clock reading of a UTC instant in the supplied zone, such as a deletion time to show. */
export function toFloating(instant: Temporal.Instant, timeZone: string): Temporal.PlainDateTime {
  return instant.toZonedDateTimeISO(timeZone).toPlainDateTime();
}
