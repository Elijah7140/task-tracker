import { expect, it } from "@effect/vitest";
import { builtInPriorityLevels, MetadataRuleError } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { ItemService } from "../../../src/services/item-service.js";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "./fixtures.js";

/** `ItemService.moveToPriorityGroup`: the card grid's drag and Alt+arrow moves (§7.17). */

const highId = builtInPriorityLevels[1].id;
const lowId = builtInPriorityLevels[3].id;

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  LookupService.layer,
  ItemService.layer("UTC"),
);

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from("2026-11-18T12:00:00Z").epochMilliseconds);
  const projects = yield* ProjectService;
  const lookups = yield* LookupService;
  const items = yield* ItemService;
  const undo = yield* UndoService;
  const sql = yield* SqlClient.SqlClient;
  const project = yield* projects.create("Project");
  const create = (title: string, parentId: string | null = null) =>
    items.create(project.id, null, parentId, title);
  return { project, lookups, items, undo, sql, create };
});

const readRow = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [row] = yield* sql.withTransaction(
      sql<{
        ParentItemId: string | null;
        PriorityLevelId: string | null;
        SortOrder: number;
        TicketRank: number | null;
        CompletedAtUtc: string | null;
      }>`SELECT ParentItemId, PriorityLevelId, SortOrder, TicketRank, CompletedAtUtc
        FROM TodoItem WHERE Id = ${id}`,
    );
    return row!;
  });

it.effect("Moving into another section sets priority and position in one undo step", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, undo, create } = yield* setup;
      const first = yield* create("First");
      const second = yield* create("Second");

      yield* items.moveToPriorityGroup(project.id, null, second.id, highId, 0);
      const moved = yield* readRow(second.id);
      const pushed = yield* readRow(first.id);
      const state = yield* undo.status();

      expect(moved.PriorityLevelId).toBe(highId);
      expect(moved.SortOrder).toBe(0);
      expect(pushed.SortOrder).toBe(1);
      expect(state.undo).toBe("Set priority of 'Second'");

      yield* undo.apply("undo");
      const restored = yield* readRow(second.id);

      expect(restored.PriorityLevelId).toBeNull();
      expect(restored.SortOrder).toBe(1);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Moving within the same section is labelled a move", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, undo, create } = yield* setup;
      const first = yield* create("First");
      yield* create("Second");

      yield* items.moveToPriorityGroup(project.id, null, first.id, null, 1);
      const moved = yield* readRow(first.id);
      const state = yield* undo.status();

      expect(moved.SortOrder).toBe(1);
      expect(moved.PriorityLevelId).toBeNull();
      expect(state.undo).toBe("Move 'First'");
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Moving a sub-item promotes it to the top level and reconciles its former parent", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, create } = yield* setup;
      const parent = yield* create("Parent");
      const doneChild = yield* create("Done child", parent.id);
      const openChild = yield* create("Open child", parent.id);
      yield* items.setCompleted(project.id, null, doneChild.id, true);

      yield* items.moveToPriorityGroup(project.id, null, openChild.id, lowId, 1);
      const promoted = yield* readRow(openChild.id);
      const reconciledParent = yield* readRow(parent.id);

      expect(promoted.ParentItemId).toBeNull();
      expect(promoted.SortOrder).toBe(1);
      expect(promoted.PriorityLevelId).toBe(lowId);
      expect(reconciledParent.CompletedAtUtc).not.toBeNull();
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("An archived priority is refused and nothing is saved", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, lookups, items, create } = yield* setup;
      const first = yield* create("First");
      yield* create("Second");
      yield* lookups.priorityLevels.archive(lowId);

      const error = yield* Effect.flip(
        items.moveToPriorityGroup(project.id, null, first.id, lowId, 1),
      );
      const unchanged = yield* readRow(first.id);

      expect(error).toBeInstanceOf(MetadataRuleError);
      expect(unchanged.PriorityLevelId).toBeNull();
      expect(unchanged.SortOrder).toBe(0);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Reordering within an archived priority keeps the archived priority", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, lookups, items, create } = yield* setup;
      const first = yield* create("First");
      const second = yield* create("Second");
      yield* items.setPriority(first.id, lowId);
      yield* items.setPriority(second.id, lowId);
      yield* lookups.priorityLevels.archive(lowId);

      yield* items.moveToPriorityGroup(project.id, null, second.id, lowId, 0);
      const moved = yield* readRow(second.id);

      expect(moved.PriorityLevelId).toBe(lowId);
      expect(moved.SortOrder).toBe(0);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Changing priority clears the ticket rank and undo restores it", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, undo, sql, create } = yield* setup;
      const ticket = yield* create("Ticket");
      yield* sql.withTransaction(sql`UPDATE TodoItem SET TicketRank = 1.5 WHERE Id = ${ticket.id}`);

      yield* items.moveToPriorityGroup(project.id, null, ticket.id, highId, 0);
      const afterMove = yield* readRow(ticket.id);

      expect(afterMove.TicketRank).toBeNull();

      yield* undo.apply("undo");
      const restored = yield* readRow(ticket.id);

      expect(restored.TicketRank).toBe(1.5);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Moves a card within a drilled-in item's level and sets its priority (§7.19)", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, undo, create } = yield* setup;
      const parent = yield* create("Parent");
      const first = yield* create("First", parent.id);
      const second = yield* create("Second", parent.id);

      yield* items.moveToPriorityGroup(project.id, null, second.id, highId, 0, parent.id);
      const moved = yield* readRow(second.id);
      const sibling = yield* readRow(first.id);
      const { undo: label } = yield* undo.status();

      expect(moved).toMatchObject({
        ParentItemId: parent.id,
        PriorityLevelId: highId,
        SortOrder: 0,
      });
      expect(sibling).toMatchObject({ ParentItemId: parent.id, SortOrder: 1 });
      expect(label).toBe("Set priority of 'Second'");
    }).pipe(Effect.provide(services)),
  ),
);
