import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { insertItem, insertProject, itemId, projectId, withSchema } from "../store.js";

const firstField = "019A0000-0000-7000-8000-000000000DDD";
const secondField = "019A0000-0000-7000-8000-000000000EEE";
const choiceId = "019A0000-0000-7000-8000-000000000FFF";

const insertFields = (dataType: "Text" | "Choice") =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* insertProject;
    yield* insertItem();
    yield* sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
             VALUES (${firstField}, 'first', 'First', ${dataType}, 0, 0),
                    (${secondField}, 'second', 'Second', ${dataType}, 0, 1)`;
  });

it.effect("Rejects due times without dates and scheduled ends without a valid start", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(insertProject.pipe(Effect.andThen(insertItem())));

    const due = yield* sql
      .withTransaction(sql`UPDATE TodoItem SET DueTime = ${"15:00:00"} WHERE Id = ${itemId}`)
      .pipe(Effect.flip);
    const noStart = yield* sql
      .withTransaction(
        sql`UPDATE TodoItem SET ScheduledEnd = ${"2026-12-01 10:00:00"} WHERE Id = ${itemId}`,
      )
      .pipe(Effect.flip);
    const reversed = yield* sql
      .withTransaction(
        sql`UPDATE TodoItem SET ScheduledStart = ${"2026-12-01 11:00:00"}, ScheduledEnd = ${"2026-12-01 10:00:00"} WHERE Id = ${itemId}`,
      )
      .pipe(Effect.flip);

    expect(due.reason.cause).toMatchObject({
      errcode: 275,
      message: expect.stringContaining("CK_TodoItem_DueTime"),
    });
    for (const error of [noStart, reversed]) {
      expect(error.reason.cause).toMatchObject({
        errcode: 275,
        message: expect.stringContaining("CK_TodoItem_ScheduledEnd"),
      });
    }
  }).pipe(withSchema),
);

it.effect("Rejects custom field rows with two values or no value", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(insertFields("Text"));

    const two = yield* sql
      .withTransaction(sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue, NumberValue)
                                               VALUES (${itemId}, ${firstField}, ${"a"}, ${1.0})`)
      .pipe(Effect.flip);
    const none = yield* sql
      .withTransaction(sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId)
                                                VALUES (${itemId}, ${firstField})`)
      .pipe(Effect.flip);

    for (const error of [two, none]) {
      expect(error.reason.cause).toMatchObject({
        errcode: 275,
        message: expect.stringContaining("CK_ItemFieldValue_ExactlyOne"),
      });
    }
  }).pipe(withSchema),
);

it.effect("Rejects a choice associated with a different field", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      insertFields("Choice").pipe(
        Effect.andThen(
          sql`INSERT INTO FieldChoice (Id, FieldDefinitionId, Label, SortOrder, IsArchived)
          VALUES (${choiceId}, ${secondField}, 'Other', 0, 0)`,
        ),
      ),
    );

    const wrongField = yield* sql
      .withTransaction(sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, ChoiceId)
                                                      VALUES (${itemId}, ${firstField}, ${choiceId})`)
      .pipe(Effect.flip);

    expect(wrongField.reason.cause).toMatchObject({ errcode: 787 });
  }).pipe(withSchema),
);

it.effect("Restricts deleting referenced projects and cascades item value deletion", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      insertFields("Text").pipe(
        Effect.andThen(
          sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue)
          VALUES (${itemId}, ${firstField}, ${"value"})`,
        ),
      ),
    );

    const restricted = yield* sql
      .withTransaction(sql`DELETE FROM Project WHERE Id = ${projectId}`)
      .pipe(Effect.flip);
    yield* sql.withTransaction(sql`DELETE FROM TodoItem WHERE Id = ${itemId}`);

    expect(restricted.reason.cause).toMatchObject({
      message: expect.stringContaining("FOREIGN KEY"),
    });
    expect(yield* sql.withTransaction(sql`SELECT * FROM ItemFieldValue`)).toEqual([]);
  }).pipe(withSchema),
);
