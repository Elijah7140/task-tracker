import { expect, it } from "@effect/vitest";
import { MetadataRuleError } from "@task-tracker/core";
import { Deferred, Effect, Fiber } from "effect";
import { SqlClient } from "effect/sql";
import { FieldService } from "../../../src/services/field-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { withSchema } from "./fixtures.js";

const withServices = <A, E>(
  test: Effect.Effect<A, E, FieldService | ProjectService | SqlClient.SqlClient>,
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
