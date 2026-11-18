import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import {
  Bit,
  DateText,
  FieldDataType,
  FloatingTimestamp,
  Guid,
  Real,
  TimeText,
  UtcTimestamp,
} from "../../src/db/storage-codecs.js";
import { insertItem, insertProject, itemId, projectId, withSchema } from "./store.js";

const dates = Schema.Struct({
  DueDate: Schema.NullOr(DateText),
  DueTime: Schema.NullOr(TimeText),
  ScheduledStart: Schema.NullOr(FloatingTimestamp),
  ScheduledEnd: Schema.NullOr(FloatingTimestamp),
  CreatedAtUtc: UtcTimestamp,
});

it.effect("Round-trips EF dates, floating times and UTC instants as SQLite text", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const item = {
      Id: itemId.toLowerCase(),
      DueDate: Temporal.PlainDate.from("2026-12-01"),
      DueTime: Temporal.PlainTime.from("15:30:00"),
      ScheduledStart: Temporal.PlainDateTime.from("2026-11-30T09:00:00"),
      ScheduledEnd: Temporal.PlainDateTime.from("2026-11-30T10:00:00.1234001"),
      CreatedAtUtc: Temporal.Instant.from("2026-11-13T12:00:00.1234000Z"),
    };
    const insert = SqlSchema.void({
      Request: Schema.Struct({ Id: Guid, ...dates.fields }),
      execute: (request) =>
        sql`INSERT INTO TodoItem ${sql.insert({
          ...request,
          ProjectId: projectId,
          Title: "Meeting",
          SortOrder: 0,
          UpdatedAtUtc: request.CreatedAtUtc,
        })}`,
    });
    const read = SqlSchema.findOne({
      Request: Guid,
      Result: dates,
      execute: (id) => sql`SELECT * FROM TodoItem WHERE Id = ${id}`,
    });

    yield* sql.withTransaction(insertProject.pipe(Effect.andThen(insert(item))));
    const restored = yield* sql.withTransaction(read(item.Id));
    const stored = yield* sql.withTransaction(
      sql`SELECT Id, DueDate, DueTime, ScheduledStart, ScheduledEnd, CreatedAtUtc FROM TodoItem`
        .values,
    );

    expect(restored.DueDate?.equals(item.DueDate)).toBe(true);
    expect(restored.DueTime?.equals(item.DueTime)).toBe(true);
    expect(restored.ScheduledStart?.equals(item.ScheduledStart)).toBe(true);
    expect(restored.ScheduledEnd?.equals(item.ScheduledEnd)).toBe(true);
    expect(restored.CreatedAtUtc.equals(item.CreatedAtUtc)).toBe(true);
    expect(stored).toEqual([
      [
        itemId,
        "2026-12-01",
        "15:30:00",
        "2026-11-30 09:00:00",
        "2026-11-30 10:00:00.1234001",
        "2026-11-13 12:00:00.1234",
      ],
    ]);
  }).pipe(withSchema),
);

it("Encodes fractional times with seven digits and accepts legacy timestamp precision", () => {
  const time = Temporal.PlainTime.from("15:30:00.5");
  const decoded = Schema.decodeUnknownSync(UtcTimestamp)("2026-11-13 12:00:00.1234567");

  expect(Schema.encodeSync(TimeText)(time)).toBe("15:30:00.5000000");
  expect(decoded.toString()).toBe("2026-11-13T12:00:00.1234567Z");
  expect(() => Schema.decodeUnknownSync(FloatingTimestamp)("2026-11-13 12:00:00Z")).toThrow();
  expect(() => Schema.decodeUnknownSync(DateText)("2026-02-30")).toThrow();
});

it("Validates GUIDs, SQLite bits, finite numbers and legacy field type names", () => {
  expect(Schema.decodeUnknownSync(Guid)(itemId.toLowerCase())).toBe(itemId);
  expect(Schema.encodeSync(Guid)(itemId.toLowerCase())).toBe(itemId);
  expect(() => Schema.decodeUnknownSync(Guid)("bad GUID")).toThrow();

  expect(Schema.decodeUnknownSync(Bit)(0)).toBe(false);
  expect(Schema.encodeSync(Bit)(true)).toBe(1);
  expect(() => Schema.decodeUnknownSync(Bit)(2)).toThrow();

  expect(Schema.decodeUnknownSync(Real)(1.25)).toBe(1.25);
  expect(() => Schema.encodeSync(Real)(Infinity)).toThrow();

  expect(Schema.decodeUnknownSync(FieldDataType)("Choice")).toBe("Choice");
  expect(() => Schema.decodeUnknownSync(FieldDataType)("choice")).toThrow();
});

it.effect("Stores field enum names, boolean bits and numbers with EF's SQLite types", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const fieldId = "019A0000-0000-7000-8000-000000000DDD";
    const field = Schema.Struct({ DataType: FieldDataType, IsArchived: Bit });
    const saveField = SqlSchema.void({
      Request: field,
      execute: (request) =>
        sql`INSERT INTO FieldDefinition ${sql.insert({
          Id: fieldId,
          Key: "estimate",
          DisplayName: "Estimate",
          SortOrder: 0,
          ...request,
        })}`,
    });
    const saveValue = SqlSchema.void({
      Request: Real,
      execute: (value) =>
        sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, NumberValue)
            VALUES (${itemId}, ${fieldId}, ${value})`,
    });
    const read = SqlSchema.findOne({
      Request: Schema.Void,
      Result: Schema.Struct({ ...field.fields, NumberValue: Real }),
      execute: () => sql`SELECT DataType, IsArchived, NumberValue FROM ItemFieldValue
                        JOIN FieldDefinition ON FieldDefinition.Id = ItemFieldValue.FieldDefinitionId`,
    });

    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* insertProject;
        yield* insertItem();
        yield* saveField({ DataType: "Number", IsArchived: true });
        yield* saveValue(1.25);
      }),
    );
    const restored = yield* sql.withTransaction(read(undefined));
    const stored = yield* sql.withTransaction(
      sql`SELECT DataType, typeof(DataType), IsArchived, typeof(IsArchived),
                 NumberValue, typeof(NumberValue)
          FROM ItemFieldValue JOIN FieldDefinition ON FieldDefinition.Id = ItemFieldValue.FieldDefinitionId`
        .values,
    );

    expect(stored).toEqual([["Number", "text", 1, "integer", 1.25, "real"]]);
    expect(restored).toEqual({ DataType: "Number", IsArchived: true, NumberValue: 1.25 });
  }).pipe(withSchema),
);
