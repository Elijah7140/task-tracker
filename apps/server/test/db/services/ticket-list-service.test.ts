import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { TicketListService } from "../../../src/services/ticket-list-service.js";
import type { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "./fixtures.js";
import { roundTrip } from "./undo-round-trip.js";

/** `TicketListService`: People, Ticket types and the ticket levels tree (§7.19). */

const services = Layer.mergeAll(TicketListService.layer);

const run = <A, E>(
  test: Effect.Effect<A, E, TicketListService | SqlClient.SqlClient | UndoService>,
) =>
  withSchema(
    Effect.gen(function* () {
      yield* TestClock.setTime(Temporal.Instant.from("2026-11-20T12:00:00Z").epochMilliseconds);
      return yield* test;
    }).pipe(Effect.provide(services)),
  );

it.effect("Adds an application, module and interface, each as one labelled undo step", () =>
  run(
    Effect.gen(function* () {
      const lists = yield* TicketListService;
      const app = yield* lists.add("Application", null, "ClockTower");

      const { label, after, undone } = yield* roundTrip(lists.add("Module", app.id, "Train"), [
        "TicketListEntry",
      ]);
      const listed = yield* lists.list();

      expect(label).toBe("Add module 'Train'");
      expect(after[0]).toHaveLength(2);
      expect(undone[0]).toHaveLength(1);
      expect(listed.map((entry) => [entry.listKind, entry.name, entry.parentId])).toEqual([
        ["Application", "ClockTower", null],
        ["Module", "Train", app.id],
      ]);
    }),
  ),
);

it.effect("Renames, archives, restores and reorders entries with their labels", () =>
  run(
    Effect.gen(function* () {
      const lists = yield* TicketListService;
      const wayne = yield* lists.add("Person", null, "Wayne");
      const melissa = yield* lists.add("Person", null, "Melissa");

      const renamed = yield* roundTrip(lists.rename(wayne.id, "Wayne Davis"), ["TicketListEntry"]);
      yield* lists.rename(wayne.id, "Wayne Davis");
      const archived = yield* roundTrip(lists.archive(melissa.id), ["TicketListEntry"]);
      yield* lists.archive(melissa.id);
      const restored = yield* roundTrip(lists.restore(melissa.id), ["TicketListEntry"]);
      const reordered = yield* roundTrip(lists.reorder("Person", null, [melissa.id, wayne.id]), [
        "TicketListEntry",
      ]);

      expect([renamed, archived, restored, reordered].map((step) => step.label)).toEqual([
        "Rename person 'Wayne Davis'",
        "Archive person 'Melissa'",
        "Restore person 'Melissa'",
        "Reorder people",
      ]);
      expect(reordered.after[0]!.map((row) => row["Name"])).toEqual(["Wayne Davis", "Melissa"]);
      expect(reordered.after[0]!.map((row) => row["SortOrder"])).toEqual([1, 0]);
    }),
  ),
);

it.effect("Refuses a module without an application and a duplicate sibling name", () =>
  run(
    Effect.gen(function* () {
      const lists = yield* TicketListService;
      const app = yield* lists.add("Application", null, "ClockTower");
      yield* lists.add("Module", app.id, "Train");

      const loose = yield* Effect.flip(lists.add("Module", null, "Loose"));
      const duplicate = yield* Effect.flip(lists.add("Module", app.id, "train"));

      expect(loose.message).toBe("A module belongs to an application.");
      expect(duplicate.message).toBe("The name 'train' is already used by another module.");
      expect(yield* lists.list()).toHaveLength(2);
    }),
  ),
);
