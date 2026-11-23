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

it.effect("Rejects due times without dates", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(insertProject.pipe(Effect.andThen(insertItem())));

    const due = yield* sql
      .withTransaction(sql`UPDATE TodoItem SET DueTime = ${"15:00:00"} WHERE Id = ${itemId}`)
      .pipe(Effect.flip);

    expect(due.reason.cause).toMatchObject({
      errcode: 275,
      message: expect.stringContaining("CK_TodoItem_DueTime"),
    });
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

it.effect("Enforces status, completion and remembered-open-status consistency", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const done = "019A0000-0000-7000-8000-000000000204";
    const queued = "019A0000-0000-7000-8000-000000000201";
    yield* sql.withTransaction(insertProject.pipe(Effect.andThen(insertItem())));

    const invalid = [
      sql`UPDATE TodoItem SET CompletedAtUtc = '2026-11-13 12:00:00'`,
      sql`UPDATE TodoItem SET StatusId = ${done}`,
      sql`UPDATE TodoItem SET ReopenStatusId = ${queued}`,
      sql`UPDATE TodoItem SET CompletedAtUtc = '2026-11-13 12:00:00',
        StatusId = ${done}, ReopenStatusId = ${done}`,
    ];
    for (const statement of invalid) {
      const failure = yield* Effect.flip(sql.withTransaction(statement));
      expect(failure.message).toContain("Item status must agree with completion");
    }
    yield* sql.withTransaction(sql`UPDATE TodoItem SET CompletedAtUtc = '2026-11-13 12:00:00',
      StatusId = ${done}, ReopenStatusId = ${queued}`);
    const archive = yield* Effect.flip(
      sql.withTransaction(sql`UPDATE StatusLevel SET IsArchived = 1 WHERE Id = ${done}`),
    );
    const remove = yield* Effect.flip(
      sql.withTransaction(sql`DELETE FROM StatusLevel WHERE Id = ${queued}`),
    );
    const kind = yield* Effect.flip(
      sql.withTransaction(sql`UPDATE StatusLevel SET Kind = 1 WHERE Id = ${queued}`),
    );

    expect(archive.message).toContain("At least one Done status must stay active");
    expect(remove.message).toContain("This status is still used by an item");
    expect(kind.message).toContain("Status kind cannot change");
  }).pipe(withSchema),
);

it.effect(
  "Allows number-only priorities and reserves each positive integer among active priorities",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.withTransaction(sql`INSERT INTO PriorityLevel (Id, Name, Number, IsBuiltIn, IsArchived, SortOrder)
      VALUES ('one', '', 7, 0, 0, 4), ('two', '', 8, 0, 0, 5), ('archived', '', 7, 0, 1, 6)`);

      const duplicate = yield* Effect.flip(
        sql.withTransaction(sql`UPDATE PriorityLevel SET IsArchived = 0 WHERE Id = 'archived'`),
      );
      const fraction = yield* Effect.flip(
        sql.withTransaction(sql`UPDATE PriorityLevel SET Number = 1.5 WHERE Id = 'two'`),
      );
      const zero = yield* Effect.flip(
        sql.withTransaction(sql`UPDATE PriorityLevel SET Number = 0 WHERE Id = 'two'`),
      );

      expect(duplicate.message).toContain("UNIQUE constraint failed: PriorityLevel.Number");
      expect(fraction.message).toContain("CK_PriorityLevel_Number");
      expect(zero.message).toContain("CK_PriorityLevel_Number");
    }).pipe(withSchema),
);
