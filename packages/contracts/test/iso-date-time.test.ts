import { Schema } from "effect";
import { expect, it } from "vitest";
import { IsoDate, IsoFloatingDateTime, IsoTime, IsoUtcInstant } from "../src/iso-date-time.js";

it("Round-trips calendar dates, floating times and UTC instants as strings", () => {
  const dates = Schema.Struct({
    dueDate: IsoDate,
    dueTime: IsoTime,
    scheduledStart: IsoFloatingDateTime,
    createdAtUtc: IsoUtcInstant,
  });
  const wire = {
    dueDate: "2028-02-29",
    dueTime: "15:30:00.1234567",
    scheduledStart: "2026-11-01T01:30:00",
    createdAtUtc: "2026-11-01T05:30:00.1234567Z",
  };

  const decoded = Schema.decodeUnknownSync(dates)(wire);
  const encoded = Schema.encodeSync(dates)(decoded);

  expect(decoded).toEqual(wire);
  expect(encoded).toEqual(wire);
});

it.each([
  [IsoDate, "2026-02-29"],
  [IsoDate, "2026-11-31"],
  [IsoTime, "24:00:00"],
  [IsoTime, "15:30:00Z"],
  [IsoFloatingDateTime, "2026-11-01 01:30:00"],
  [IsoFloatingDateTime, "2026-11-01T01:30:00-04:00"],
  [IsoUtcInstant, "2026-11-01T01:30:00"],
  [IsoUtcInstant, "2026-02-30T01:30:00Z"],
])("Rejects %s input %s outside the wire format", (schema, value) => {
  expect(() => Schema.decodeUnknownSync(schema)(value)).toThrow();
});
