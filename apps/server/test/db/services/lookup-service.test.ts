import { expect, it } from "@effect/vitest";
import { builtInPriorityLevels, comparePriority } from "@task-tracker/core";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { itemId, readItems, seedItem, withSchema } from "./fixtures.js";
import { snapshotTables } from "./undo-round-trip.js";

it.effect("Added, renamed and reordered lookups persist", () =>
  Effect.gen(function* () {
    const lookups = yield* LookupService;
    const priority = yield* lookups.priorityLevels.add("Later");
    const levels = yield* lookups.priorityLevels.list();

    yield* lookups.priorityLevels.rename(priority.id, "Someday");
    yield* lookups.priorityLevels.reorder([
      priority.id,
      ...levels.filter((row) => row.id !== priority.id).map((row) => row.id),
    ]);

    expect((yield* lookups.priorityLevels.list())[0]).toMatchObject({
      id: priority.id,
      name: "Someday",
      sortOrder: 0,
    });
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Archived priorities stay on items", () =>
  Effect.gen(function* () {
    const lookups = yield* LookupService;
    const projects = yield* ProjectService;
    const project = yield* projects.create("Project");
    const priority = yield* lookups.priorityLevels.add("Later");
    yield* seedItem(project.id, { Id: itemId, PriorityLevelId: priority.id });

    yield* lookups.priorityLevels.archive(priority.id);
    const items = yield* readItems();
    const levels = yield* lookups.priorityLevels.list();

    expect(items).toMatchObject([{ PriorityLevelId: priority.id }]);
    expect(levels).toContainEqual({ ...priority, isArchived: true });
  }).pipe(
    Effect.provide(LookupService.layer),
    Effect.provide(ProjectService.layer("UTC")),
    withSchema,
  ),
);

it.effect("Adding or renaming to an existing lookup name is rejected ignoring case", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const custom = yield* priorityLevels.add("Custom");

    const added = yield* Effect.flip(priorityLevels.add(" custom "));
    const renamed = yield* Effect.flip(priorityLevels.rename(custom.id, "High"));

    expect(added.message).toBe("The name 'custom' is already used by another priority level.");
    expect(renamed.message).toBe("The name 'High' is already used by another priority level.");
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Renaming a lookup to its own name is allowed", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const level = yield* priorityLevels.add("Later");

    yield* priorityLevels.rename(level.id, "later");
    const levels = yield* priorityLevels.list();

    expect(levels).toContainEqual({ ...level, name: "later" });
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Restoring archived lookups preserves their identity and order", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const priority = yield* priorityLevels.add("Later");
    yield* priorityLevels.archive(priority.id);

    yield* priorityLevels.restore(priority.id);

    expect(yield* priorityLevels.list()).toContainEqual(priority);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

const changeLookupsDirectly = (statement: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(sql.unsafe(statement));
  });

it.effect("Persists numbers 1, 7 and 2 in rank order and reorders independently", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const [critical, high, medium, low] = builtInPriorityLevels;

    yield* priorityLevels.setNumber(critical.id, 1);
    yield* priorityLevels.setNumber(high.id, 7);
    yield* priorityLevels.setNumber(medium.id, 2);
    const before = yield* priorityLevels.list();
    yield* priorityLevels.reorder([medium.id, critical.id, high.id, low.id]);
    const after = yield* priorityLevels.list();

    expect(before.map((row) => row.number)).toEqual([1, 7, 2, null]);
    expect(comparePriority(before[1]!, before[2]!)).toBeLessThan(0);
    expect(after.map((row) => row.number)).toEqual([2, 1, 7, null]);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Adds number-only and named levels and keeps the number when renaming", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;

    const numberOnly = yield* priorityLevels.add("  ", 7);
    const named = yield* priorityLevels.add("Hotfix", 8);
    yield* priorityLevels.rename(named.id, "Urgent");
    yield* priorityLevels.rename(numberOnly.id, "");
    const levels = yield* priorityLevels.list();

    expect(levels.slice(-2)).toEqual([
      { ...numberOnly, name: "", number: 7 },
      { ...named, name: "Urgent", number: 8 },
    ]);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Says to restore an archived lookup when adding or renaming to its name", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const level = yield* priorityLevels.add("Bug");
    const other = yield* priorityLevels.add("Other");
    yield* priorityLevels.archive(level.id);

    const added = yield* Effect.flip(priorityLevels.add("BUG"));
    const renamed = yield* Effect.flip(priorityLevels.rename(other.id, "bug"));

    expect(added.message).toBe(
      "The name 'BUG' is used by an archived priority level. Restore it instead.",
    );
    expect(renamed.message).toBe(
      "The name 'bug' is used by an archived priority level. Restore or rename that one first.",
    );
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Reserves archived names and releases archived numbers until restoration", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const archived = yield* priorityLevels.add("Later", 7);
    const duplicate = yield* Effect.flip(priorityLevels.add("", 7));
    yield* priorityLevels.archive(archived.id);
    const replacement = yield* priorityLevels.add("", 7);
    const other = yield* priorityLevels.add("", 2);

    const addName = yield* Effect.flip(priorityLevels.add("LATER"));
    const rename = yield* Effect.flip(priorityLevels.rename(replacement.id, "later"));
    const restore = yield* Effect.flip(priorityLevels.restore(archived.id));
    const editNumber = yield* Effect.flip(priorityLevels.setNumber(other.id, 7));
    const clear = yield* Effect.flip(priorityLevels.setNumber(replacement.id, null));
    const levels = yield* priorityLevels.list();

    expect(addName.message).toBe(
      "The name 'LATER' is used by an archived priority level. Restore it instead.",
    );
    expect(rename.message).toBe(
      "The name 'later' is used by an archived priority level. Restore or rename that one first.",
    );
    for (const failure of [duplicate, restore, editNumber]) {
      expect(failure.message).toBe("Priority number 7 is already in use.");
    }
    expect(clear.message).toBe("Name must be 1 to 300 characters.");
    expect(levels.slice(-3)).toEqual([{ ...archived, isArchived: true }, replacement, other]);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Undoes and redoes a number edit and a new number-only priority", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const undo = yield* UndoService;
    const high = builtInPriorityLevels[1];
    yield* priorityLevels.setNumber(high.id, 7);
    const added = yield* priorityLevels.add("", 9);
    const latest = yield* undo.status();

    yield* undo.apply("undo");
    const afterFirstUndo = yield* undo.status();
    yield* undo.apply("undo");
    const undone = yield* priorityLevels.list();
    yield* undo.apply("redo");
    yield* undo.apply("redo");
    const redone = yield* priorityLevels.list();

    expect(latest.undo).toBe("Add priority '9'");
    expect(afterFirstUndo.undo).toBe("Edit priority '7 · High'");
    expect(undone).toEqual(builtInPriorityLevels);
    expect(redone).toContainEqual(added);
    expect(redone).toContainEqual({ ...high, number: 7 });
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

const priorityOperations = {
  rename: "Rename priority '42 · Renamed'",
  archive: "Archive priority '42 · Custom'",
  restore: "Restore priority '42 · Custom'",
  reorder: "Reorder priority levels",
} as const;

it.effect.each(Object.entries(priorityOperations))(
  "Round-trips a priority %s and refuses to undo it after the row changed",
  ([operation, label]) =>
    Effect.gen(function* () {
      const { priorityLevels } = yield* LookupService;
      const undo = yield* UndoService;
      const level = yield* priorityLevels.add("Custom", 42);
      if (operation === "restore") {
        yield* priorityLevels.archive(level.id);
      }
      const before = yield* priorityLevels.list();
      const reversed = before.map((row) => row.id).toReversed();
      const run = {
        rename: () => priorityLevels.rename(level.id, "Renamed"),
        archive: () => priorityLevels.archive(level.id),
        restore: () => priorityLevels.restore(level.id),
        reorder: () => priorityLevels.reorder(reversed),
      }[operation as keyof typeof priorityOperations];

      yield* run();
      const after = yield* priorityLevels.list();
      const history = yield* undo.status();
      yield* undo.apply("undo");
      const undone = yield* priorityLevels.list();
      yield* undo.apply("redo");
      const redone = yield* priorityLevels.list();
      yield* changeLookupsDirectly("UPDATE PriorityLevel SET SortOrder = 99 WHERE Number = 42");
      const changed = yield* priorityLevels.list();
      const refusal = yield* Effect.flip(undo.apply("undo"));

      expect(history.undo).toBe(label);
      expect(undone).toEqual(before);
      expect(redone).toEqual(after);
      expect(refusal.message).toBe("This priority level changed since; can't undo.");
      expect(yield* priorityLevels.list()).toEqual(changed);
    }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Refuses to redo a priority number claimed by another active level", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const undo = yield* UndoService;
    const original = yield* priorityLevels.add("Original");
    yield* priorityLevels.setNumber(original.id, 42);
    yield* undo.apply("undo");
    yield* changeLookupsDirectly("UPDATE PriorityLevel SET Number = 42 WHERE Name = 'Low'");
    const before = yield* priorityLevels.list();
    const history = yield* undo.status();

    const failure = yield* Effect.flip(undo.apply("redo"));

    expect(failure.message).toBe("Priority number 42 is already in use.");
    expect(yield* priorityLevels.list()).toEqual(before);
    expect(yield* undo.status()).toEqual(history);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Refuses to undo into a case-equivalent archived priority name", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const undo = yield* UndoService;
    const original = yield* priorityLevels.add("Ürgent");
    yield* priorityLevels.archive(builtInPriorityLevels[3].id);
    yield* priorityLevels.rename(original.id, "Renamed");
    yield* changeLookupsDirectly("UPDATE PriorityLevel SET Name = 'ürgent' WHERE Name = 'Low'");
    const before = yield* priorityLevels.list();
    const history = yield* undo.status();

    const failure = yield* Effect.flip(undo.apply("undo"));

    expect(failure.message).toBe("The name 'ürgent' is already used by another priority level.");
    expect(yield* priorityLevels.list()).toEqual(before);
    expect(yield* undo.status()).toEqual(history);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

const rankedKinds = ["PriorityLevel"] as const;

/** Inserts a lookup the way an import does, appending it at `sortOrder` outside history. */
const importLookupAtRank = (table: (typeof rankedKinds)[number], sortOrder: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const [template] = yield* sql<Record<string, unknown>>`
          SELECT * FROM ${sql(table)} ORDER BY SortOrder LIMIT 1`;
        const row = {
          ...template,
          Id: "019A0000-0000-7000-8000-00000000F00D",
          Name: "Imported",
          IsBuiltIn: 0,
          SortOrder: sortOrder,
          ...(table === "PriorityLevel" && { Number: null }),
        };
        yield* sql`INSERT INTO ${sql(table)} ${sql.insert(row)}`;
      }),
    );
  });

it.effect.each(rankedKinds)("Refuses to redo a %s rank now used by an imported lookup", (table) =>
  Effect.gen(function* () {
    const lookups = yield* LookupService;
    const undo = yield* UndoService;
    const added = yield* lookups.priorityLevels.add("Original");
    yield* undo.apply("undo");
    yield* importLookupAtRank(table, added.sortOrder);
    const before = yield* snapshotTables([table]);
    const history = yield* undo.status();

    const failure = yield* Effect.flip(undo.apply("redo"));

    expect(failure.message).toContain("rank");
    expect(yield* snapshotTables([table])).toEqual(before);
    expect(yield* undo.status()).toEqual(history);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);
