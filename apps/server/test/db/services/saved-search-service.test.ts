import { expect, it } from "@effect/vitest";
import type { SavedSearchDefinition, SearchScope } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { ProjectService } from "../../../src/services/project-service.js";
import { SavedSearchService } from "../../../src/services/saved-search-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "./fixtures.js";

const startedAt = Temporal.Instant.from("2026-11-13T12:00:00Z");
const allProjects: SearchScope = { kind: "allProjects" };
const services = Layer.mergeAll(ProjectService.layer("UTC"), SavedSearchService.layer);

const definition = (
  queryText: string,
  scope: SearchScope = allProjects,
  includeCompleted = false,
): SavedSearchDefinition => ({ queryText, scope, includeCompleted });

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(startedAt.epochMilliseconds);
  return {
    saved: yield* SavedSearchService,
    projects: yield* ProjectService,
    undo: yield* UndoService,
    sql: yield* SqlClient.SqlClient,
  };
});

const run = <A, E>(
  test: Effect.Effect<
    A,
    E,
    SavedSearchService | ProjectService | UndoService | SqlClient.SqlClient
  >,
) => test.pipe(Effect.provide(services), withSchema);

/** Reads the stored rows through a fresh operation, in display order. */
const storedRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(sql`SELECT * FROM SavedSearch ORDER BY SortOrder, Name`);
});

const listedNames = Effect.gen(function* () {
  const saved = yield* SavedSearchService;
  return (yield* saved.list()).map((search) => search.name);
});

it.effect("A saved search keeps its query, scope and switches after reload", () =>
  run(
    Effect.gen(function* () {
      const { saved, projects } = yield* setup;
      const project = yield* projects.create("Billing");
      const scope: SearchScope = {
        kind: "area",
        projectId: project.id,
        folderId: "019A0000-0000-7000-8000-000000000F01",
        includeSubfolders: false,
      };

      yield* saved.save("Overdue", definition("due<today", scope, true), false);
      const [loaded] = yield* saved.list();

      expect(loaded).toMatchObject({
        name: "Overdue",
        queryText: "due<today",
        scope,
        includeCompleted: true,
        sortOrder: 0,
      });
      expect(loaded?.createdAtUtc).toEqual(startedAt);
      expect(yield* storedRows).toEqual([
        expect.objectContaining({
          ScopeKind: "Folder",
          ProjectId: project.id,
          FolderId: scope.folderId,
          IncludeSubfolders: 0,
          IncludeCompleted: 1,
        }),
      ]);
    }),
  ),
);

it.effect("Reads a legacy row with a project-root folder scope and seven-digit timestamps", () =>
  run(
    Effect.gen(function* () {
      const { saved, sql } = yield* setup;
      yield* sql`INSERT INTO SavedSearch ${sql.insert({
        Id: "019A0000-0000-7000-8000-000000000FFA",
        Name: "At root",
        QueryText: "has:ticket",
        ScopeKind: "Folder",
        ProjectId: "019A0000-0000-7000-8000-000000000AAA",
        FolderId: null,
        IncludeSubfolders: 0,
        IncludeCompleted: 0,
        SortOrder: 0,
        CreatedAtUtc: "2026-11-13 12:00:00.1234567",
        UpdatedAtUtc: "2026-11-13 12:00:00.1234567",
      })}`;

      const found = yield* saved.find("019a0000-0000-7000-8000-000000000ffa");

      expect(found.scope).toEqual({
        kind: "area",
        projectId: "019A0000-0000-7000-8000-000000000AAA",
        folderId: null,
        includeSubfolders: false,
      });
      expect(found.createdAtUtc.toString()).toBe("2026-11-13T12:00:00.1234567Z");
    }),
  ),
);

it.effect("Saving a duplicate name ignoring case is refused unless overwriting", () =>
  run(
    Effect.gen(function* () {
      const { saved } = yield* setup;
      const original = yield* saved.save("Overdue", definition("due<today"), false);

      const refused = yield* Effect.flip(saved.save("OVERDUE", definition("due<tomorrow"), false));
      const replaced = yield* saved.save(" overdue ", definition("due<tomorrow"), true);

      expect(refused.message).toBe("A saved search named 'Overdue' already exists.");
      expect(replaced).toMatchObject({ id: original.id, name: "Overdue" });
      expect(yield* saved.list()).toEqual([
        expect.objectContaining({ name: "Overdue", queryText: "due<tomorrow" }),
      ]);
    }),
  ),
);

it.effect("The database itself rejects two names that differ only by case", () =>
  run(
    Effect.gen(function* () {
      const { sql } = yield* setup;
      const row = (id: string, name: string) => ({
        Id: id,
        Name: name,
        QueryText: "a",
        ScopeKind: "AllProjects",
        IncludeSubfolders: 1,
        IncludeCompleted: 0,
        SortOrder: 0,
        CreatedAtUtc: "2026-11-13 12:00:00",
        UpdatedAtUtc: "2026-11-13 12:00:00",
      });
      yield* sql`INSERT INTO SavedSearch ${sql.insert(row("019A0000-0000-7000-8000-000000000F01", "Mine"))}`;

      const failure = yield* Effect.flip(
        sql`INSERT INTO SavedSearch ${sql.insert(row("019A0000-0000-7000-8000-000000000F02", "MINE"))}`,
      );

      expect(failure.reason._tag).toBe("UniqueViolation");
    }),
  ),
);

it.effect("Saving a search limited to a missing or deleted project fails and stores nothing", () =>
  run(
    Effect.gen(function* () {
      const { saved, projects } = yield* setup;
      const project = yield* projects.create("Doomed");
      yield* projects.delete(project.id);
      const ghost = "019A0000-0000-7000-8000-000000000F09";

      const missing = yield* Effect.flip(
        saved.save("Ghost", definition("x", { kind: "project", projectId: ghost }), false),
      );
      const deleted = yield* Effect.flip(
        saved.save(
          "Doomed",
          definition("x", {
            kind: "area",
            projectId: project.id,
            folderId: null,
            includeSubfolders: false,
          }),
          false,
        ),
      );

      expect(missing.message).toBe("The project this search is limited to no longer exists.");
      expect(deleted.message).toBe("The project this search is limited to no longer exists.");
      expect(yield* storedRows).toEqual([]);
    }),
  ),
);

it.effect("Rename changes the name, allows a case change and refuses another search's name", () =>
  run(
    Effect.gen(function* () {
      const { saved } = yield* setup;
      const first = yield* saved.save("First", definition("a"), false);
      yield* saved.save("Second", definition("b"), false);

      yield* saved.rename(first.id, "Renamed");
      yield* saved.rename(first.id.toLowerCase(), "RENAMED");
      const refused = yield* Effect.flip(saved.rename(first.id, "second"));

      expect(refused.message).toBe("A saved search named 'Second' already exists.");
      expect(yield* listedNames).toEqual(["RENAMED", "Second"]);
    }),
  ),
);

it.effect("A failed operation leaves nothing behind for the next one", () =>
  run(
    Effect.gen(function* () {
      const { saved } = yield* setup;
      const first = yield* saved.save("First", definition("a"), false);
      yield* saved.save("Second", definition("b"), false);

      yield* Effect.flip(saved.rename(first.id, "Second"));
      yield* Effect.flip(saved.save("Third", definition("x".repeat(4001)), false));
      yield* saved.save("Third", definition("c"), false);

      expect(yield* listedNames).toEqual(["First", "Second", "Third"]);
    }),
  ),
);

it.effect("Delete removes the search and a deleted search no longer exists", () =>
  run(
    Effect.gen(function* () {
      const { saved } = yield* setup;
      const gone = yield* saved.save("Gone", definition("a"), false);

      yield* saved.delete(gone.id);

      const again = yield* Effect.flip(saved.delete(gone.id));
      const found = yield* Effect.flip(saved.find(gone.id));
      const renamed = yield* Effect.flip(saved.rename(gone.id, "Back"));
      expect(yield* storedRows).toEqual([]);
      for (const failure of [again, found, renamed]) {
        expect(failure).toMatchObject({
          entity: "SavedSearch",
          message: "This saved search no longer exists.",
        });
      }
    }),
  ),
);

it.effect("Reorder puts listed searches first and keeps the rest in order", () =>
  run(
    Effect.gen(function* () {
      const { saved } = yield* setup;
      const a = yield* saved.save("A", definition("a"), false);
      yield* saved.save("B", definition("b"), false);
      const c = yield* saved.save("C", definition("c"), false);

      yield* saved.reorder([c.id]);
      const repeated = yield* Effect.flip(saved.reorder([a.id, a.id]));
      const unknown = yield* Effect.flip(saved.reorder(["019A0000-0000-7000-8000-000000000F09"]));

      expect(yield* listedNames).toEqual(["C", "A", "B"]);
      expect(repeated.message).toBe(
        "The new order names a saved search that does not exist or repeats one.",
      );
      expect(unknown.message).toBe(repeated.message);
    }),
  ),
);

it.effect("A new search goes after the existing ones", () =>
  run(
    Effect.gen(function* () {
      const { saved } = yield* setup;
      yield* saved.save("B", definition("b"), false);

      yield* saved.save("A", definition("a"), false);

      expect(yield* listedNames).toEqual(["B", "A"]);
    }),
  ),
);

type Operation = "save" | "replace" | "rename" | "reorder" | "delete";

const operations: ReadonlyArray<readonly [Operation, string]> = [
  ["save", "Save search 'Added'"],
  ["replace", "Replace saved search 'First'"],
  ["rename", "Rename saved search 'Renamed'"],
  ["reorder", "Reorder saved searches"],
  ["delete", "Delete saved search 'First'"],
];

it.effect.each(operations)(
  "Records %s as one step that round trips and refuses a changed row",
  ([operation, label]) =>
    run(
      Effect.gen(function* () {
        const { saved, undo, sql } = yield* setup;
        const first = yield* saved.save("First", definition("first", allProjects, true), false);
        const second = yield* saved.save("Second", definition("second", allProjects, true), false);
        const before = yield* storedRows;
        const edits: Record<Operation, Effect.Effect<unknown, unknown>> = {
          save: saved.save("Added", definition("added"), false),
          replace: saved.save("First", definition("replaced"), true),
          rename: saved.rename(first.id, "Renamed"),
          reorder: saved.reorder([second.id, first.id]),
          delete: saved.delete(first.id),
        };

        yield* edits[operation];
        const after = yield* storedRows;
        const undone = yield* undo.apply("undo");
        const restored = yield* storedRows;
        yield* undo.apply("redo");
        const redone = yield* storedRows;
        const deleting = operation === "delete";
        if (deleting) {
          yield* undo.apply("undo");
        }
        yield* sql.withTransaction(
          sql`UPDATE SavedSearch SET QueryText = 'external'
              WHERE Name IN ('First', 'Added', 'Renamed')`,
        );
        const refused = yield* Effect.flip(undo.apply(deleting ? "redo" : "undo"));

        expect(undone?.label).toBe(label);
        expect(after).not.toEqual(before);
        expect(restored).toEqual(before);
        expect(redone).toEqual(after);
        expect(refused.message).toBe(
          `This saved search changed since; can't ${deleting ? "redo" : "undo"}.`,
        );
        expect((yield* undo.status()).undo).toBe(deleting ? "Save search 'Second'" : label);
      }),
    ),
);

it.effect.each(["Mine", "Über"])(
  "Refuses to undo deleting %s when another search took the name in another case meanwhile",
  (name) =>
    run(
      Effect.gen(function* () {
        const { saved, undo, sql } = yield* setup;
        const mine = yield* saved.save(name, definition("a"), false);
        yield* saved.delete(mine.id);
        yield* sql.withTransaction(
          sql`INSERT INTO SavedSearch ${sql.insert({
            Id: "019A0000-0000-7000-8000-000000000F01",
            Name: name.toUpperCase(),
            QueryText: "b",
            ScopeKind: "AllProjects",
            IncludeSubfolders: 1,
            IncludeCompleted: 0,
            SortOrder: 5,
            CreatedAtUtc: "2026-11-13 12:00:00",
            UpdatedAtUtc: "2026-11-13 12:00:00",
          })}`,
        );

        const refused = yield* Effect.flip(undo.apply("undo"));

        expect(refused.message).toBe(
          "Another entry now uses the same name, key or number; can't undo.",
        );
        expect(yield* listedNames).toEqual([name.toUpperCase()]);
        expect((yield* undo.status()).undo).toBe(`Delete saved search '${name}'`);
      }),
    ),
);
