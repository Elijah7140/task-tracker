import { expect, it } from "@effect/vitest";
import { MetadataRuleError, type ItemEdit } from "@task-tracker/core";
import { Deferred, Effect, Fiber } from "effect";
import type { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { TicketService } from "../../../src/services/ticket-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { readItems } from "./fixtures.js";
import { editFields, type SearchServices, withSearchServices } from "./search-fixtures.js";

const completedStatusId = "019A0000-0000-7000-8000-000000000204";

const setup = (svc: SearchServices) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
    const project = yield* svc.projects.create("Project");
    const tickets = yield* TicketService;
    const undo = yield* UndoService;
    /** Creates an item one second after the last and numbers it with its own title. */
    const add = (
      title: string,
      options: { priorityId?: string; projectId?: string; parentId?: string } = {},
    ) =>
      Effect.gen(function* () {
        yield* TestClock.adjust("1 second");
        const projectId = options.projectId ?? project.id;
        const item = yield* svc.items.create(projectId, null, options.parentId ?? null, title);
        const fields = editFields(title, {
          ticketNumber: title,
          priorityLevelId: options.priorityId ?? null,
        });
        yield* svc.items.edit(item.id, fields);
        return item;
      });
    const section = (priorityId: string | null, projectId: string | null = null) =>
      Effect.map(tickets.load(projectId), (board) => {
        const found = board.sections.find((entry) => (entry.priority?.id ?? null) === priorityId);
        return found?.tickets ?? [];
      });
    const ids = (priorityId: string | null, projectId: string | null = null) =>
      Effect.map(section(priorityId, projectId), (rows) => rows.map(({ id }) => id));
    const stored = (itemId: string) =>
      svc.sql<{
        TicketRank: number | null;
        PriorityLevelId: string | null;
        SortOrder: number;
      }>`SELECT TicketRank, PriorityLevelId, SortOrder FROM TodoItem WHERE Id = ${itemId}`.pipe(
        svc.sql.withTransaction,
        Effect.map((rows) => rows[0]!),
      );
    const clearRanks = (...itemIds: ReadonlyArray<string>) =>
      svc.sql
        .withTransaction(
          svc.sql`UPDATE TodoItem SET TicketRank = NULL WHERE Id IN ${svc.sql.in(itemIds)}`,
        )
        .pipe(Effect.asVoid);
    return { project, tickets, undo, add, section, ids, stored, clearRanks };
  });

type World = Effect.Success<ReturnType<typeof setup>>;

const test = (
  name: string,
  body: (
    svc: SearchServices,
    world: World,
  ) => Effect.Effect<void, unknown, SqlClient.SqlClient | UndoService>,
) =>
  it.effect(name, () =>
    withSearchServices((svc) =>
      Effect.flatMap(setup(svc), (world) => body(svc, world)).pipe(
        Effect.provide(TicketService.layer),
      ),
    ),
  );

const at = (priorityLevelId: string | null, anchorId: string | null = null, after = false) => ({
  priorityLevelId,
  anchorId,
  after,
});

for (const redo of [false, true]) {
  test(`A competing move waits until ${redo ? "redo" : "undo"} has saved and updated history`, (svc, world) =>
    Effect.gen(function* () {
      const moving = yield* world.add("Moving");
      const first = yield* svc.lookups.priorityLevels.add("First", 1);
      const second = yield* svc.lookups.priorityLevels.add("Second", 2);
      yield* world.tickets.setPriority(moving.id, first.id);
      if (redo) {
        yield* world.undo.apply("undo");
      }
      const release = yield* Deferred.make<void>();
      const holder = yield* svc.sql
        .withTransaction(Deferred.await(release))
        .pipe(Effect.forkChild({ startImmediately: true }));

      const applying = yield* world.undo
        .apply(redo ? "redo" : "undo")
        .pipe(Effect.forkChild({ startImmediately: true }));
      const competing = yield* world.tickets
        .setPriority(moving.id, second.id)
        .pipe(Effect.forkChild({ startImmediately: true }));
      const wroteWhileHeld = competing.pollUnsafe() !== undefined;
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(holder);
      yield* Fiber.join(applying);

      expect(yield* Fiber.join(competing)).toBe(true);
      expect(wroteWhileHeld).toBe(false);
      expect((yield* world.stored(moving.id)).PriorityLevelId).toBe(second.id);
      expect(yield* world.undo.status()).toMatchObject({
        undo: "Set priority of 'Moving'",
        redo: null,
      });
      yield* world.undo.apply("undo");
      expect((yield* world.stored(moving.id)).PriorityLevelId).toBe(redo ? first.id : null);
    }));
}

for (const editor of [false, true]) {
  test(`Numbering an older item through ${editor ? "the editor" : "an edit"} appends it after legacy tickets, even after removal`, (svc, world) =>
    Effect.gen(function* () {
      const older = yield* svc.items.create(world.project.id, null, null, "Older");
      const first = yield* world.add("First");
      const second = yield* world.add("Second");
      yield* world.clearRanks(first.id, second.id);
      const number = (ticketNumber: string | null) => {
        const fields: ItemEdit = editFields("Older", { ticketNumber });
        return editor
          ? svc.items.edit(older.id, fields, [], undefined, [])
          : svc.items.edit(older.id, fields);
      };
      yield* number("OLD-1");
      const initialOrder = yield* world.ids(null);

      yield* world.tickets.move(older.id, at(null));
      yield* number(null);
      yield* number("OLD-1");
      const finalOrder = yield* world.ids(null);

      expect(initialOrder).toEqual([first.id, second.id, older.id]);
      expect(finalOrder).toEqual([first.id, second.id, older.id]);
      expect((yield* world.stored(older.id)).TicketRank).not.toBeNull();
    }));
}

test("Section order uses sort order and listing does not assign ranks", (svc, world) =>
  Effect.gen(function* () {
    const first = yield* svc.lookups.priorityLevels.add("First", 1);
    const hotfix = yield* svc.lookups.priorityLevels.add("Hotfix", 7);
    const later = yield* svc.lookups.priorityLevels.add("Later", 2);
    const unprioritized = yield* world.add("T-0");
    yield* world.add("T-1", { priorityId: first.id });
    yield* world.add("T-7", { priorityId: hotfix.id });
    yield* world.add("T-2", { priorityId: later.id });
    yield* world.clearRanks(unprioritized.id);
    const before = yield* world.undo.status();

    const board = yield* world.tickets.load(null);

    const filled = board.sections.filter((section) => section.tickets.length > 0);
    expect(filled.map((section) => section.priority?.number ?? null)).toEqual([null, 1, 7, 2]);
    expect(board.sections.map((section) => section.priority?.name ?? null)).toEqual([
      null,
      "Critical",
      "High",
      "Medium",
      "Low",
      "First",
      "Hotfix",
      "Later",
    ]);
    expect((yield* world.stored(unprioritized.id)).TicketRank).toBeNull();
    expect(yield* world.undo.status()).toEqual(before);
  }));

test("Moving at section edges assigns ranks and clears the priority in no priority", (svc, world) =>
  Effect.gen(function* () {
    const level = yield* svc.lookups.priorityLevels.add("Hotfix", 7);
    const first = yield* world.add("First");
    const second = yield* world.add("Second", { priorityId: level.id });
    const third = yield* world.add("Third", { priorityId: level.id });
    const sortOrder = (yield* world.stored(first.id)).SortOrder;

    yield* world.tickets.move(first.id, at(level.id, third.id, true));
    const prioritized = yield* world.section(level.id);
    yield* world.tickets.move(first.id, at(null));
    const cleared = yield* world.section(null);

    expect(prioritized.map(({ id }) => id)).toEqual([second.id, third.id, first.id]);
    expect(prioritized.map(({ ticketRank }) => ticketRank)).toEqual([0, 1, 2]);
    expect(cleared).toMatchObject([{ id: first.id, ticketRank: 0, priorityLevelId: null }]);
    expect((yield* world.stored(first.id)).SortOrder).toBe(sortOrder);
  }));

test("Moving before an anchor uses the full section even when filtered", (svc, world) =>
  Effect.gen(function* () {
    const other = yield* svc.projects.create("Other");
    const hidden = yield* world.add("Hidden", { projectId: other.id });
    const visible = yield* world.add("Visible");
    const moving = yield* world.add("Moving");

    yield* world.tickets.move(moving.id, at(null, visible.id));
    const newest = yield* world.add("Newest");
    const filtered = yield* world.ids(null, world.project.id);
    const all = yield* world.ids(null);

    expect(filtered).toEqual([moving.id, visible.id, newest.id]);
    expect(all).toEqual([hidden.id, moving.id, visible.id, newest.id]);
    expect((yield* world.stored(newest.id)).TicketRank).toBe(3);
  }));

test("Set priority appends and each change has one labelled undo step", (svc, world) =>
  Effect.gen(function* () {
    const level = yield* svc.lookups.priorityLevels.add("Hotfix", 7);
    const moving = yield* world.add("Moving");
    const existing = yield* world.add("Existing", { priorityId: level.id });
    const labels: Array<string | null> = [];
    const label = Effect.map(world.undo.status(), ({ undo }) => labels.push(undo));

    expect(yield* world.tickets.setPriority(moving.id, level.id)).toBe(true);
    yield* label;
    expect(yield* world.tickets.setPriority(moving.id, level.id)).toBe(false);
    const appended = yield* world.ids(level.id);
    expect(yield* world.tickets.move(moving.id, at(level.id))).toBe(true);
    yield* label;
    expect(yield* world.tickets.move(moving.id, at(level.id))).toBe(false);
    yield* world.undo.apply("undo");
    const undoMove = yield* world.ids(level.id);
    yield* world.undo.apply("undo");
    const undoPriority = [yield* world.section(null), yield* world.section(level.id)];
    yield* world.undo.apply("redo");
    yield* world.undo.apply("redo");

    expect(labels).toEqual(["Set priority of 'Moving'", "Move 'Moving'"]);
    expect(appended).toEqual([existing.id, moving.id]);
    expect(undoMove).toEqual([existing.id, moving.id]);
    expect(undoPriority.map((rows) => rows.map(({ ticketRank }) => ticketRank))).toEqual([
      [0],
      [0],
    ]);
    expect(yield* world.ids(level.id)).toEqual([moving.id, existing.id]);
  }));

test("Only open numbered items in active projects and folders are tickets", (svc, world) =>
  Effect.gen(function* () {
    const parent = yield* svc.items.create(world.project.id, null, null, "No ticket number");
    const child = yield* world.add("Child", { parentId: parent.id });
    const completed = yield* world.add("Completed");
    const deleted = yield* world.add("Deleted");
    const other = yield* svc.projects.create("Deleted project");
    yield* world.add("Hidden", { projectId: other.id });
    const folder = yield* svc.folders.create(world.project.id, null, "Deleted folder");
    const inFolder = yield* svc.items.create(world.project.id, folder.id, null, "In folder");
    yield* svc.items.edit(inFolder.id, editFields("In folder", { ticketNumber: "F-1" }));
    yield* svc.items.setCompleted(world.project.id, null, completed.id, true);
    yield* svc.items.delete(world.project.id, null, deleted.id);
    yield* svc.projects.delete(other.id);
    yield* svc.folders.delete(world.project.id, folder.id);

    const visible = yield* world.ids(null);
    const refused = yield* Effect.flip(world.tickets.move(child.id, at(null, completed.id)));

    expect(visible).toEqual([child.id]);
    expect(refused).toEqual(
      new MetadataRuleError("The target ticket has moved or is no longer open."),
    );
    expect((yield* world.stored(child.id)).TicketRank).toBe(0);
    expect(yield* Effect.flip(world.tickets.move(deleted.id, at(null)))).toEqual(
      new MetadataRuleError("This item is no longer an open ticket."),
    );
  }));

test("An archived level keeps its section while it has tickets but accepts no new ones", (svc, world) =>
  Effect.gen(function* () {
    const level = yield* svc.lookups.priorityLevels.add("Old");
    const kept = yield* world.add("Kept", { priorityId: level.id });
    const other = yield* world.add("Other");
    yield* svc.lookups.priorityLevels.archive(level.id);

    const withTicket = yield* world.tickets.load(null);
    const refused = yield* Effect.flip(world.tickets.move(other.id, at(level.id)));
    yield* world.tickets.move(kept.id, at(null, other.id, true));
    const emptied = yield* world.tickets.load(null);

    expect(withTicket.sections.at(-1)?.priority?.name).toBe("Old");
    expect(refused).toEqual(new MetadataRuleError("Choose an active priority level."));
    expect(emptied.sections.map((section) => section.priority?.name ?? null)).not.toContain("Old");
  }));

test("Undo refuses a move whose tickets changed since and changes nothing", (_svc, world) =>
  Effect.gen(function* () {
    const first = yield* world.add("First");
    const second = yield* world.add("Second");
    yield* world.tickets.move(second.id, at(null));
    yield* world.clearRanks(first.id);
    const before = yield* readItems();

    const refusal = yield* Effect.flip(world.undo.apply("undo"));

    expect(refusal).toEqual(new MetadataRuleError("This item changed since; can't undo."));
    expect(yield* readItems()).toEqual(before);
    expect((yield* world.undo.status()).undo).toBe("Move 'Second'");
  }));

test("An interrupted move saves nothing and keeps the history", (svc, world) =>
  Effect.gen(function* () {
    const level = yield* svc.lookups.priorityLevels.add("Hotfix");
    const moving = yield* world.add("Moving");
    const before = yield* readItems();
    const release = yield* Deferred.make<void>();
    const holder = yield* svc.sql
      .withTransaction(Deferred.await(release))
      .pipe(Effect.forkChild({ startImmediately: true }));

    const move = yield* world.tickets
      .move(moving.id, at(level.id))
      .pipe(Effect.forkChild({ startImmediately: true }));
    yield* Fiber.interrupt(move);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(holder);

    expect(yield* readItems()).toEqual(before);
    expect((yield* world.undo.status()).undo).toBe("Edit 'Moving'");
  }));

test("Renumbering, completing and reopening a ticket keep its rank", (svc, world) =>
  Effect.gen(function* () {
    yield* world.add("First");
    const second = yield* world.add("Second");

    yield* svc.items.edit(second.id, editFields("Second", { ticketNumber: "NEW-2" }));
    yield* svc.items.setCompleted(world.project.id, null, second.id, true);
    yield* svc.items.setCompleted(world.project.id, null, second.id, false);

    expect((yield* world.stored(second.id)).TicketRank).toBe(1);
  }));

test("An editor save that numbers and completes an item leaves it unranked", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* svc.items.create(world.project.id, null, null, "Done");

    yield* svc.items.edit(item.id, {
      ...editFields("Done", { ticketNumber: "D-1" }),
      statusId: completedStatusId,
    });

    expect((yield* world.stored(item.id)).TicketRank).toBeNull();
  }));

test("Undoing the edit that numbered an item removes its rank with the number", (svc, world) =>
  Effect.gen(function* () {
    const legacy = yield* world.add("Legacy");
    yield* world.clearRanks(legacy.id);
    const item = yield* svc.items.create(world.project.id, null, null, "Numbered");
    yield* svc.items.edit(item.id, editFields("Numbered", { ticketNumber: "N-1" }));

    yield* world.undo.apply("undo");

    expect(yield* world.stored(item.id)).toMatchObject({ TicketRank: null });
    expect(yield* world.stored(legacy.id)).toMatchObject({ TicketRank: null });
    yield* world.undo.apply("redo");
    expect(yield* world.ids(null)).toEqual([legacy.id, item.id]);
  }));
