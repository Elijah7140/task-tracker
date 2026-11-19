import { Schema } from "effect";

const datePattern = "(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])";
const timePattern = "(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\\.[0-9]{1,9})?)?";

const validCalendarDay = Schema.makeFilter(
  (text: string) => {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(5, 7));
    const day = Number(text.slice(8, 10));
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

    if (month === 2) {
      return day <= (leapYear ? 29 : 28);
    }
    return day <= ([4, 6, 9, 11].includes(month) ? 30 : 31);
  },
  { expected: "a valid Gregorian calendar day" },
);

/** A calendar date in YYYY-MM-DD form. */
export const IsoDate = Schema.String.check(
  Schema.isPattern(new RegExp(`^${datePattern}$`)),
  validCalendarDay,
);

/** A wall-clock time with optional seconds and fractional precision. */
export const IsoTime = Schema.String.check(Schema.isPattern(new RegExp(`^${timePattern}$`)));

/** A scheduled local date and time, with no offset or zone. */
export const IsoFloatingDateTime = Schema.String.check(
  Schema.isPattern(new RegExp(`^${datePattern}T${timePattern}$`)),
  validCalendarDay,
);

/** A UTC timestamp with a Z suffix, preserving fractional precision. */
export const IsoUtcInstant = Schema.String.check(
  Schema.isPattern(new RegExp(`^${datePattern}T${timePattern}Z$`)),
  validCalendarDay,
);
