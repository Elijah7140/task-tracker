import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { LookupService } from "../../../src/services/lookup-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "./fixtures.js";

const completedId = "019A0000-0000-7000-8000-000000000204";

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
  const { statuses } = yield* LookupService;
  const undo = yield* UndoService;
  const sql = yield* SqlClient.SqlClient;
  const named = (name: string) =>
    statuses.list().pipe(Effect.map((rows) => rows.find((row) => row.name === name)!));
  return { statuses, undo, sql, named };
});

const withServices = <A, E>(
  test: Effect.Effect<A, E, LookupService | UndoService | SqlClient.SqlClient>,
) => test.pipe(Effect.provide(Layer.mergeAll(LookupService.layer)), withSchema);

/** Inserts a status as another writer, such as an import, would. */
const insertStatus = (id: string, name: string, sortOrder: number, isArchived = 0) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(sql`INSERT INTO StatusLevel
      (Id, Kind, Name, IsBuiltIn, IsArchived, SortOrder)
      VALUES (${id}, 0, ${name}, 0, ${isArchived}, ${sortOrder})`);
  });

it.effect("Added, renamed and reordered statuses persist with their kind", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses, named } = yield* setup;
      const added = yield* statuses.add("  Review ", "Open");
      yield* statuses.rename(added.id, "Ready for review");
      const ids = (yield* statuses.list()).map((row) => row.id).filter((id) => id !== added.id);

      yield* statuses.reorder([added.id, ...ids]);

      expect(yield* named("Ready for review")).toEqual({
        id: added.id,
        name: "Ready for review",
        kind: "Open",
        isArchived: false,
        sortOrder: 0,
        isInProgress: false,
      });
      expect((yield* statuses.list()).map((row) => row.name)).toEqual([
        "Ready for review",
        "Queued",
        "In progress",
        "Testing",
        "Completed",
      ]);
    }),
  ),
);

it.effect("Adding or renaming to an archived name says to restore the archived status", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses } = yield* setup;
      const blocked = yield* statuses.add("Blocked", "Open");
      yield* statuses.archive(blocked.id);

      const added = yield* Effect.flip(statuses.add("blocked", "Open"));
      const renamed = yield* Effect.flip(statuses.rename(completedId, "blocked"));
      const duplicate = yield* Effect.flip(statuses.add(" queued ", "Done"));

      expect(added.message).toBe(
        "The name 'blocked' is used by an archived status. Restore it instead.",
      );
      expect(renamed.message).toBe(
        "The name 'blocked' is used by an archived status. Restore or rename that one first.",
      );
      expect(duplicate.message).toBe("The name 'queued' is already used by another status.");
    }),
  ),
);

it.effect("The last active Done status cannot be archived and archived statuses restore", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses, named } = yield* setup;
      const queued = yield* named("Queued");

      const refusal = yield* Effect.flip(statuses.archive(completedId));
      yield* statuses.archive(queued.id);
      const archived = yield* named("Queued");
      yield* statuses.restore(queued.id);

      expect(refusal.message).toBe("At least one Done status must stay active.");
      expect(archived.isArchived).toBe(true);
      expect(yield* named("Queued")).toEqual(queued);
    }),
  ),
);

it.effect("Each status list change is one labelled undo step", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses, undo, named } = yield* setup;
      const before = yield* statuses.list();
      const review = yield* statuses.add("Review", "Open");
      yield* statuses.rename(review.id, "Ready");
      yield* statuses.archive(review.id);
      yield* statuses.restore(review.id);
      yield* statuses.reorder([review.id, ...before.map((row) => row.id)]);

      const labels: (string | undefined)[] = [];
      for (let step = 0; step < 5; step++) {
        labels.push((yield* undo.apply("undo"))?.label);
      }

      expect(labels).toEqual([
        "Reorder statuses",
        "Restore status 'Ready'",
        "Archive status 'Ready'",
        "Rename status 'Ready'",
        "Add status 'Review'",
      ]);
      expect(yield* statuses.list()).toEqual(before);
      expect(yield* named("Review")).toBeUndefined();
    }),
  ),
);

it.effect("Redo refuses a rank now used by another status and keeps the step", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses, undo } = yield* setup;
      yield* statuses.add("Original", "Open");
      yield* undo.apply("undo");
      yield* insertStatus("019A0000-0000-7000-8000-00000000AAAA", "Imported", 4);
      const before = yield* statuses.list();

      const error = yield* Effect.flip(undo.apply("redo"));

      expect(error.message).toBe("Another status now uses the same rank; can't redo.");
      expect(yield* statuses.list()).toEqual(before);
      expect((yield* undo.status()).redo).toBe("Add status 'Original'");
    }),
  ),
);

it.effect("Undo refuses an archived status name with different Unicode case", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses, undo } = yield* setup;
      const original = yield* statuses.add("Ürgent", "Open");
      yield* statuses.rename(original.id, "Review");
      yield* insertStatus("019A0000-0000-7000-8000-00000000AAAA", "ürgent", 9, 1);
      const before = yield* statuses.list();

      const error = yield* Effect.flip(undo.apply("undo"));

      expect(error.message).toBe("Another status now uses the same name; can't undo.");
      expect(yield* statuses.list()).toEqual(before);
      expect((yield* undo.status()).undo).toBe("Rename status 'Review'");
    }),
  ),
);

it.effect("The seeded In progress status starts marked and the mark is one undo step", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses, undo, named } = yield* setup;
      const testing = yield* named("Testing");

      yield* statuses.setInProgress(testing.id, true);

      expect(
        (yield* statuses.list()).filter((row) => row.isInProgress).map((row) => row.name),
      ).toEqual(["In progress", "Testing"]);
      expect((yield* undo.status()).undo).toBe("Mark in progress 'Testing'");
      yield* undo.apply("undo");
      expect((yield* named("Testing")).isInProgress).toBe(false);
    }),
  ),
);

it.effect("A Done status cannot be marked In progress", () =>
  withServices(
    Effect.gen(function* () {
      const { statuses, named } = yield* setup;

      const refused = yield* Effect.flip(statuses.setInProgress(completedId, true));

      expect(refused.message).toBe("Only an Open status can be marked In progress.");
      expect((yield* named("Completed")).isInProgress).toBe(false);
    }),
  ),
);
