import { expect, it } from "@effect/vitest";
import { MetadataRuleError } from "@task-tracker/core";
import { Deferred, Effect, Fiber } from "effect";
import { SqlClient } from "effect/sql";
import { FieldService } from "../../../src/services/field-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { itemId, seedItem, withSchema } from "./fixtures.js";
import { refuseAfterChange, roundTrip, snapshotTables } from "./undo-round-trip.js";

const withServices = <A, E>(
  test: Effect.Effect<A, E, FieldService | ProjectService | SqlClient.SqlClient | UndoService>,
) =>
  test.pipe(
    Effect.provide(FieldService.layer),
    Effect.provide(ProjectService.layer("UTC")),
    withSchema,
  );

it.effect("Effective fields list active global fields before the current project's fields", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const projects = yield* ProjectService;
      const project = yield* projects.create("Project");
      const another = yield* projects.create("Another");
      const local = yield* fields.create("Local", "Text", project.id);
      const global = yield* fields.create("Global", "Text", null);
      const archived = yield* fields.create("Archived", "Text", project.id);
      yield* fields.archive(archived.id);
      yield* fields.create("Local", "Text", another.id);

      const effective = yield* fields.listEffective(project.id.toLowerCase());
      const managed = yield* fields.listAll(project.id);

      expect(effective).toEqual([global, local]);
      expect(managed).toHaveLength(3);
      expect(managed).toContainEqual({ ...archived, isArchived: true });
    }),
  ),
);

it.effect("Visible field names are unique after trimming and ignoring case", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const projects = yield* ProjectService;
      const project = yield* projects.create("Project");
      const global = yield* fields.create(" Impact ", "Text", null);

      const error = yield* Effect.flip(fields.create(" impact ", "Text", project.id));
      const effective = yield* fields.listEffective(project.id);

      expect(error).toBeInstanceOf(MetadataRuleError);
      expect(effective).toMatchObject([{ id: global.id, displayName: "Impact" }]);
    }),
  ),
);

it.effect("A project field name blocks a later global field with the same name", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const projects = yield* ProjectService;
      const project = yield* projects.create("Project");
      yield* fields.create("Impact", "Text", project.id);

      const error = yield* Effect.flip(fields.create("IMPACT", "Text", null));

      expect(error.message).toContain("already visible");
      expect(yield* fields.listAll(null)).toEqual([]);
    }),
  ),
);

it.effect("Field rename and restore recheck visible names and preserve the key", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const first = yield* fields.create("First", "Text", null);
      const second = yield* fields.create("Second", "Text", null);

      const renameError = yield* Effect.flip(fields.rename(second.id, " first "));
      yield* fields.archive(first.id);
      yield* fields.rename(second.id, "First");
      const restoreError = yield* Effect.flip(fields.restore(first.id));
      const saved = yield* fields.listAll(null);

      expect(renameError.message).toContain("already visible");
      expect(restoreError.message).toContain("already visible");
      expect(saved).toEqual([
        { ...first, isArchived: true },
        { ...second, displayName: "First" },
      ]);
    }),
  ),
);

it.effect("An archived field reserves its key", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const first = yield* fields.create("Impact", "Text", null);
      yield* fields.archive(first.id);

      yield* fields.create("Impact", "Text", null);
      const saved = yield* fields.listAll(null);

      expect(saved.map((field) => field.key)).toEqual(["impact", "impact-2"]);
    }),
  ),
);

it.effect("Choice rename and restore recheck active labels", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const field = yield* fields.create("Status", "Choice", null);
      const first = yield* fields.addChoice(field.id, " First ");
      const second = yield* fields.addChoice(field.id, "Second");

      const renameError = yield* Effect.flip(fields.renameChoice(field.id, second.id, " first "));
      yield* fields.archiveChoice(field.id, first.id);
      yield* fields.renameChoice(field.id, second.id, "First");
      const restoreError = yield* Effect.flip(fields.restoreChoice(field.id, first.id));
      const saved = yield* fields.listChoices(field.id.toLowerCase());

      expect(renameError.message).toContain("already used");
      expect(restoreError.message).toContain("already used");
      expect(saved).toMatchObject([
        { id: first.id, label: "First", isArchived: true },
        { id: second.id, label: "First", isArchived: false },
      ]);
    }),
  ),
);

it.effect("Field reorder includes archived rows and is limited to the requested scope", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const projects = yield* ProjectService;
      const project = yield* projects.create("Project");
      const global = yield* fields.create("Global", "Text", null);
      const first = yield* fields.create("First", "Text", project.id);
      const second = yield* fields.create("Second", "Text", project.id);
      yield* fields.archive(first.id);

      const wrongScope = yield* Effect.flip(fields.reorder(project.id, [second.id, global.id]));
      yield* fields.reorder(project.id, [second.id.toLowerCase(), first.id]);
      const saved = yield* fields.listAll(project.id);

      expect(wrongScope).toBeInstanceOf(MetadataRuleError);
      expect(saved).toEqual([
        global,
        { ...second, sortOrder: 0 },
        { ...first, sortOrder: 1, isArchived: true },
      ]);
    }),
  ),
);

it.effect("A definition write waits for the active SQLite transaction to release", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const sql = yield* SqlClient.SqlClient;
      const release = yield* Deferred.make<void>();
      const holder = yield* sql
        .withTransaction(Deferred.await(release))
        .pipe(Effect.forkChild({ startImmediately: true }));

      const pending = yield* fields
        .create("Waiting", "Text", null)
        .pipe(Effect.forkChild({ startImmediately: true }));
      expect(pending.pollUnsafe()).toBeUndefined();
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(holder);
      const field = yield* Fiber.join(pending);

      expect(yield* fields.listAll(null)).toEqual([field]);
    }),
  ),
);

it.effect("Choices reorder within their field and restore to their saved position", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const field = yield* fields.create("Status", "Choice", null);
      const other = yield* fields.create("Other", "Choice", null);
      const first = yield* fields.addChoice(field.id, "First");
      const second = yield* fields.addChoice(field.id, "Second");
      const foreign = yield* fields.addChoice(other.id, "Foreign");
      yield* fields.archiveChoice(field.id, first.id);

      const wrongScope = yield* Effect.flip(
        fields.reorderChoices(field.id, [second.id, foreign.id]),
      );
      yield* fields.reorderChoices(field.id, [second.id, first.id]);
      yield* fields.restoreChoice(field.id, first.id);
      const saved = yield* fields.listChoices(field.id);

      expect(wrongScope).toBeInstanceOf(MetadataRuleError);
      expect(saved).toEqual([
        { ...second, sortOrder: 0 },
        { ...first, sortOrder: 1 },
      ]);
      expect(yield* fields.listChoices(other.id)).toEqual([foreign]);
    }),
  ),
);

it.effect("Identifies missing fields and choices by entity", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const field = yield* fields.create("Status", "Choice", null);
      const missingId = "0190A1B2-0000-7000-8000-000000000999";

      const missingField = yield* Effect.flip(fields.addChoice(missingId, "Ready"));
      const missingChoice = yield* Effect.flip(fields.renameChoice(field.id, missingId, "Done"));

      expect(missingField).toMatchObject({ entity: "Field" });
      expect(missingChoice).toMatchObject({ entity: "Choice" });
    }),
  ),
);

const fieldOperations = {
  create: "Add field 'Added'",
  rename: "Rename field 'Renamed'",
  "change type": "Change type of field 'First'",
  archive: "Archive field 'First'",
  restore: "Restore field 'First'",
  reorder: "Reorder fields",
} as const;

it.effect.each(Object.entries(fieldOperations))(
  "Round-trips a field %s and refuses to undo it after the row changed",
  ([operation, label]) =>
    withServices(
      Effect.gen(function* () {
        const fields = yield* FieldService;
        const first = yield* fields.create("First", "Text", null);
        const second = yield* fields.create("Second", "Text", null);
        if (operation === "restore") {
          yield* fields.archive(first.id);
        }
        const run = {
          create: () => fields.create("Added", "Text", null),
          rename: () => fields.rename(first.id, "Renamed"),
          "change type": () => fields.changeType(first.id, "Number"),
          archive: () => fields.archive(first.id),
          restore: () => fields.restore(first.id),
          reorder: () => fields.reorder(null, [second.id, first.id]),
        }[operation as keyof typeof fieldOperations];

        const trip = yield* roundTrip(run(), ["FieldDefinition"]);
        const refusal = yield* refuseAfterChange(
          "UPDATE FieldDefinition SET SortOrder = 99 WHERE Key IN ('first', 'added')",
          "undo",
          ["FieldDefinition"],
        );

        expect(trip.label).toBe(label);
        expect(trip.after).not.toEqual(trip.before);
        expect(trip.undone).toEqual(trip.before);
        expect(trip.redone).toEqual(trip.after);
        expect(refusal.failure.message).toBe("This field changed since; can't undo.");
        expect(refusal.afterTables).toEqual(refusal.changed);
        expect(refusal.afterHistory).toEqual(refusal.history);
      }),
    ),
);

/** A project choice field with two choices and an item whose value is the first. */
const choiceWorld = Effect.gen(function* () {
  const fields = yield* FieldService;
  const projects = yield* ProjectService;
  const sql = yield* SqlClient.SqlClient;
  const project = yield* projects.create("Project");
  const field = yield* fields.create("Choice", "Choice", project.id);
  const first = yield* fields.addChoice(field.id, "First");
  const second = yield* fields.addChoice(field.id, "Second");
  yield* seedItem(project.id, { Id: itemId });
  yield* sql.withTransaction(
    sql`INSERT INTO ItemFieldValue ${sql.insert({
      ItemId: itemId,
      FieldDefinitionId: field.id,
      ChoiceId: first.id,
    })}`,
  );
  return { fields, sql, project, field, first, second };
});

const choiceOperations = {
  add: "Add choice 'Added'",
  rename: "Rename choice 'Renamed'",
  archive: "Archive choice 'First'",
  restore: "Restore choice 'First'",
  reorder: "Reorder choices",
} as const;

const choiceTables = ["FieldDefinition", "FieldChoice", "TodoItem", "ItemFieldValue"] as const;

it.effect.each(Object.entries(choiceOperations))(
  "Round-trips a choice %s and refuses to undo it after the row changed",
  ([operation, label]) =>
    withServices(
      Effect.gen(function* () {
        const { fields, sql, field, first, second } = yield* choiceWorld;
        if (operation === "restore") {
          yield* fields.archiveChoice(field.id, first.id);
        }
        const run = {
          add: () => fields.addChoice(field.id, "Added"),
          rename: () => fields.renameChoice(field.id, first.id, "Renamed"),
          archive: () => fields.archiveChoice(field.id, first.id),
          restore: () => fields.restoreChoice(field.id, first.id),
          reorder: () => fields.reorderChoices(field.id, [second.id, first.id]),
        }[operation as keyof typeof choiceOperations];

        const trip = yield* roundTrip(run(), choiceTables);
        const refusal = yield* refuseAfterChange(
          "UPDATE FieldChoice SET SortOrder = 99 WHERE Label IN ('First', 'Renamed', 'Added')",
          "undo",
          choiceTables,
        );
        const values = yield* sql.withTransaction(sql`SELECT ChoiceId FROM ItemFieldValue`);

        expect(trip.label).toBe(label);
        expect(trip.after).not.toEqual(trip.before);
        expect(trip.undone).toEqual(trip.before);
        expect(trip.redone).toEqual(trip.after);
        expect(refusal.failure.message).toBe("This field choice changed since; can't undo.");
        expect(refusal.afterTables).toEqual(refusal.changed);
        expect(refusal.afterHistory).toEqual(refusal.history);
        expect(values).toEqual([{ ChoiceId: first.id }]);
      }),
    ),
);

it.effect("Refuses to redo a type change after the field gained values", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const projects = yield* ProjectService;
      const undo = yield* UndoService;
      const sql = yield* SqlClient.SqlClient;
      const project = yield* projects.create("Project");
      const field = yield* fields.create("Estimate", "Text", null);
      yield* fields.changeType(field.id, "Number");
      yield* undo.apply("undo");
      yield* seedItem(project.id, { Id: itemId });
      const insertValue = sql`INSERT INTO ItemFieldValue ${sql.insert({
        ItemId: itemId,
        FieldDefinitionId: field.id,
        TextValue: "Large",
      })}`;
      yield* sql.withTransaction(insertValue);
      const before = yield* snapshotTables(["FieldDefinition", "ItemFieldValue"]);
      const history = yield* undo.status();

      const failure = yield* Effect.flip(undo.apply("redo"));

      expect(failure.message).toBe(
        "This field is now in use. Applying this step would change its type.",
      );
      expect(yield* snapshotTables(["FieldDefinition", "ItemFieldValue"])).toEqual(before);
      expect(yield* undo.status()).toEqual(history);
    }),
  ),
);

it.effect("Refuses to undo a rename when another visible field now uses the old name", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const projects = yield* ProjectService;
      const undo = yield* UndoService;
      const project = yield* projects.create("Project");
      const field = yield* fields.create("Impact", "Text", null);
      yield* fields.rename(field.id, "Effect");

      const refusal = yield* refuseAfterChange(
        `INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, ProjectId, IsArchived, SortOrder)
         VALUES ('019A0000-0000-7000-8000-00000000F1E1', 'imported', 'IMPACT', 'Text',
                 '${project.id}', 0, 0)`,
        "undo",
        ["FieldDefinition"],
      );

      expect(refusal.failure.message).toBe(
        "A field with this name is now visible in the same project.",
      );
      expect(refusal.afterTables).toEqual(refusal.changed);
      expect(refusal.afterHistory).toEqual(refusal.history);
      expect((yield* undo.status()).undo).toBe("Rename field 'Effect'");
    }),
  ),
);

it.effect("Refuses to redo restoring a choice whose label another active choice now uses", () =>
  withServices(
    Effect.gen(function* () {
      const { fields, field, first } = yield* choiceWorld;
      const undo = yield* UndoService;
      yield* fields.archiveChoice(field.id, first.id);
      yield* fields.restoreChoice(field.id, first.id);
      yield* undo.apply("undo");

      const refusal = yield* refuseAfterChange(
        `INSERT INTO FieldChoice (Id, FieldDefinitionId, Label, SortOrder, IsArchived)
         VALUES ('019A0000-0000-7000-8000-00000000F1E2', '${field.id}', 'first', 5, 0)`,
        "redo",
        ["FieldChoice"],
      );

      expect(refusal.failure.message).toBe("This choice label is now used by another choice.");
      expect(refusal.afterTables).toEqual(refusal.changed);
      expect(refusal.afterHistory).toEqual(refusal.history);
    }),
  ),
);

it.effect("Refuses to undo adding a field that an item now uses", () =>
  withServices(
    Effect.gen(function* () {
      const fields = yield* FieldService;
      const projects = yield* ProjectService;
      const project = yield* projects.create("Project");
      yield* seedItem(project.id, { Id: itemId });
      const field = yield* fields.create("Impact", "Text", null);

      const refusal = yield* refuseAfterChange(
        `INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue)
         VALUES ('${itemId}', '${field.id}', 'High')`,
        "undo",
        ["FieldDefinition", "ItemFieldValue"],
      );

      expect(refusal.failure.message).toBe(
        "Other data still depends on this field; can't undo its removal.",
      );
      expect(refusal.afterTables).toEqual(refusal.changed);
      expect(refusal.afterHistory).toEqual(refusal.history);
    }),
  ),
);
