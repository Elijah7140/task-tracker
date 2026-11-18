import { Effect, Schema, SchemaIssue, SchemaTransformation } from "effect";

const hyphenatedGuid = Schema.String.check(
  Schema.isPattern(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i),
);
const uppercase = (value: string) => value.toUpperCase();

/** Uppercase hyphenated GUIDs for SQLite keys and bound requests. */
export const Guid = hyphenatedGuid.pipe(
  Schema.decodeTo(
    hyphenatedGuid,
    SchemaTransformation.transform({ decode: uppercase, encode: uppercase }),
  ),
);

/** SQLite's INTEGER encoding for booleans. */
export const Bit = Schema.BooleanFromBit;

/** Finite numeric custom-field values stored with SQLite REAL affinity. */
export const Real = Schema.Finite;

/** The enum names persisted by the EF field definition mapping. */
export const FieldDataType = Schema.Literals(["Text", "Number", "Date", "Boolean", "Choice"]);

const datePattern = "(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}";
const timePattern = "[0-9]{2}:[0-9]{2}:[0-5][0-9]";
const dateText = Schema.String.check(Schema.isPattern(new RegExp(`^${datePattern}$`)));
const timeText = Schema.String.check(
  Schema.isPattern(new RegExp(`^${timePattern}(?:\\.[0-9]{7})?$`)),
);
const timestampText = Schema.String.check(
  Schema.isPattern(new RegExp(`^${datePattern} ${timePattern}(?:\\.[0-9]{1,7})?$`)),
);

function temporalText<A>(parse: (text: string) => A, format: (value: A) => string) {
  return SchemaTransformation.transformEffect({
    decode: (text: string) =>
      Effect.try({
        try: () => parse(text),
        catch: () => new SchemaIssue.InvalidValue({ message: "Invalid EF date or time" }, text),
      }),
    encode: (value: A) => Effect.succeed(format(value)),
  });
}

/** EF DateOnly text, decoded as a calendar date without a zone. */
export const DateText = dateText.pipe(
  Schema.decodeTo(
    Schema.instanceOf(Temporal.PlainDate),
    temporalText(
      (text) => Temporal.PlainDate.from(text),
      (date) => date.toString(),
    ),
  ),
);

/** EF TimeOnly text, which pads nonzero fractions to seven digits. */
export const TimeText = timeText.pipe(
  Schema.decodeTo(
    Schema.instanceOf(Temporal.PlainTime),
    temporalText(
      (text) => Temporal.PlainTime.from(text),
      (time) => {
        const text = time.toString();
        return text.includes(".") ? text.padEnd(16, "0") : text;
      },
    ),
  ),
);

/** Scheduled timestamps use EF DateTime text and stay on the wall clock. */
export const FloatingTimestamp = timestampText.pipe(
  Schema.decodeTo(
    Schema.instanceOf(Temporal.PlainDateTime),
    temporalText(
      (text) => Temporal.PlainDateTime.from(text),
      (timestamp) => timestamp.toString().replace("T", " "),
    ),
  ),
);

/** UTC columns store offset-free EF DateTime text and decode explicitly as UTC. */
export const UtcTimestamp = timestampText.pipe(
  Schema.decodeTo(
    Schema.instanceOf(Temporal.Instant),
    temporalText(
      (text) => Temporal.Instant.from(`${text}Z`),
      (instant) => instant.toString().replace("T", " ").slice(0, -1),
    ),
  ),
);
