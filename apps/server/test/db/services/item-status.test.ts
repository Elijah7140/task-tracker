import { expect, it } from "@effect/vitest";
import { SettingsCatalogue, type StatusKind } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FieldService } from "../../../src/services/field-service.js";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { SettingsService } from "../../../src/services/settings-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "./fixtures.js";

/** Item status assignment and its completion linkage in ItemService (§7.15). */

const completedId = "019A0000-0000-7000-8000-000000000204";
const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  FolderService.layer,
  LookupService.layer,
  ItemService.layer("UTC"),
  FieldService.layer,
  SettingsService.layer,
);

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
  const projects = yield* ProjectService;
  const lookups = yield* LookupService;
  const items = yield* ItemService;
  const undo = yield* UndoService;
  const sql = yield* SqlClient.SqlClient;
  const project = yield* projects.create("Project");
  const create = (title: string, parentId: string | null = null) =>
    items.create(project.id, null, parentId, title);
  const complete = (itemId: string, completed = true) =>
    items.setCompleted(project.id, null, itemId, completed);
  const findStatus = (name: string) =>
    lookups.statuses.list().pipe(Effect.map((rows) => rows.find((row) => row.name === name)!));
  const addStatus = (name: string, kind: StatusKind) =>
    lookups.statuses.add(name, kind).pipe(Effect.andThen(findStatus(name)));
  return { project, lookups, items, undo, sql, create, complete, findStatus, addStatus };
});

/** Reads the stored status columns through a fresh operation. */
const readItem = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [row] = yield* sql.withTransaction(
      sql<{
        StatusId: string | null;
        ReopenStatusId: string | null;
        CompletedAtUtc: string | null;
      }>`SELECT StatusId, ReopenStatusId, CompletedAtUtc FROM TodoItem WHERE Id = ${id}`,
    );
    return row!;
  });

const statusPair = (id: string) =>
  readItem(id).pipe(Effect.map((row) => [row.StatusId, row.ReopenStatusId]));

/** Adds a Done status and moves it above Completed, so completing an item chooses it. */
const addDoneStatusFirst = Effect.fnUntraced(function* (name: string) {
  const lookups = yield* LookupService;
  yield* lookups.statuses.add(name, "Done");
  const added = (yield* lookups.statuses.list()).find((row) => row.name === name)!;
  const ids = (yield* lookups.statuses.list()).map((row) => row.id).filter((id) => id !== added.id);
  ids.splice(ids.indexOf(completedId), 0, added.id);
  yield* lookups.statuses.reorder(ids);
  return added;
});

const withServices = <A, E>(
  test: Effect.Effect<
    A,
    E,
    | ProjectService
    | FolderService
    | LookupService
    | ItemService
    | FieldService
    | SettingsService
    | UndoService
    | SqlClient.SqlClient
  >,
) => test.pipe(Effect.provide(services), withSchema);

it.effect(
  "Setting Done confirms the subtree and reopens ancestors with their previous status",
  () =>
    withServices(
      Effect.gen(function* () {
        const { items, undo, create, findStatus, addStatus } = yield* setup;
        const root = yield* create("Root");
        const parent = yield* create("Parent", root.id);
        const leaf = yield* create("Leaf", parent.id);
        const queued = yield* findStatus("Queued");
        const released = yield* addStatus("Released", "Done");
        yield* items.setStatus(root.id, queued.id);
        yield* items.setStatus(parent.id, queued.id);

        const prompt = yield* items.setStatus(parent.id, released.id);
        const unconfirmed = yield* readItem(parent.id);
        yield* items.setStatus(parent.id, released.id, [leaf.id]);
        const history = yield* undo.status();
        const blocked = yield* items.setStatus(parent.id, null);

        expect(prompt).toMatchObject({ kind: "needs-confirmation", openSubItemCount: 1 });
        expect(unconfirmed.StatusId).toBe(queued.id);
        expect(yield* statusPair(parent.id)).toEqual([released.id, queued.id]);
        expect(yield* statusPair(leaf.id)).toEqual([completedId, null]);
        expect(yield* statusPair(root.id)).toEqual([completedId, queued.id]);
        expect(history.undo).toBe("Set status of 'Parent'");
        expect(blocked.kind).toBe("blocked");

        yield* items.setStatus(leaf.id, queued.id);
        const reopened = yield* readItem(root.id);

        expect(reopened).toEqual({
          StatusId: queued.id,
          ReopenStatusId: null,
          CompletedAtUtc: null,
        });
        expect(yield* statusPair(parent.id)).toEqual([queued.id, null]);
      }),
    ),
);

it.effect(
  "Structure changes complete parents with the first Done status and restore their open status",
  () =>
    withServices(
      Effect.gen(function* () {
        const { project, items, create, complete, findStatus } = yield* setup;
        const released = yield* addDoneStatusFirst("Released");
        const inProgress = yield* findStatus("In progress");
        const parent = yield* create("Parent");
        const open = yield* create("Open child", parent.id);
        const done = yield* create("Done child", parent.id);
        yield* items.setStatus(parent.id, inProgress.id);
        yield* complete(done.id);

        const batchId = yield* items.delete(project.id, null, open.id);
        const completed = yield* statusPair(parent.id);
        yield* items.restore(project.id, null, batchId);
        const restored = yield* statusPair(parent.id);
        yield* items.move(project.id, null, open.id, null);
        const movedAway = yield* statusPair(parent.id);
        yield* create("New child", parent.id);
        const added = yield* statusPair(parent.id);

        expect(completed).toEqual([released.id, inProgress.id]);
        expect(restored).toEqual([inProgress.id, null]);
        expect(movedAway).toEqual([released.id, inProgress.id]);
        expect(added).toEqual([inProgress.id, null]);
        expect((yield* readItem(done.id)).StatusId).toBe(released.id);
      }),
    ),
);

it.effect("Turning auto-complete on completes parents with the first Done status", () =>
  withServices(
    Effect.gen(function* () {
      const { items, create, complete, findStatus } = yield* setup;
      const settings = yield* SettingsService;
      const { autoCompleteParents } = SettingsCatalogue;
      yield* settings.setGlobal(autoCompleteParents, false);
      const testing = yield* findStatus("Testing");
      const parent = yield* create("Parent");
      const child = yield* create("Child", parent.id);
      yield* items.setStatus(parent.id, testing.id);
      yield* complete(child.id);
      const released = yield* addDoneStatusFirst("Released");
      const preview = yield* settings.previewGlobalAutoComplete();

      yield* settings.setGlobal(autoCompleteParents, true, preview);

      const reconciled = yield* readItem(parent.id);
      expect(reconciled.CompletedAtUtc).not.toBeNull();
      expect([reconciled.StatusId, reconciled.ReopenStatusId]).toEqual([released.id, testing.id]);
    }),
  ),
);

it.effect(
  "An Open status or none reopens a completed item and another Done status keeps it completed",
  () =>
    withServices(
      Effect.gen(function* () {
        const { items, create, complete, findStatus, addStatus } = yield* setup;
        const item = yield* create("Leaf");
        const queued = yield* findStatus("Queued");
        const testing = yield* findStatus("Testing");
        const released = yield* addStatus("Released", "Done");
        yield* items.setStatus(item.id, queued.id);
        yield* complete(item.id);

        yield* items.setStatus(item.id, released.id);
        const switched = yield* readItem(item.id);
        yield* items.setStatus(item.id, testing.id);
        const reopened = yield* readItem(item.id);
        yield* complete(item.id);
        yield* items.setStatus(item.id, null);
        const cleared = yield* readItem(item.id);

        expect(switched.CompletedAtUtc).not.toBeNull();
        expect([switched.StatusId, switched.ReopenStatusId]).toEqual([released.id, queued.id]);
        expect(reopened).toEqual({
          StatusId: testing.id,
          ReopenStatusId: null,
          CompletedAtUtc: null,
        });
        expect(cleared).toEqual({ StatusId: null, ReopenStatusId: null, CompletedAtUtc: null });
      }),
    ),
);

it.effect("Archived statuses cannot be assigned", () =>
  withServices(
    Effect.gen(function* () {
      const { lookups, items, create, findStatus } = yield* setup;
      const item = yield* create("Leaf");
      const queued = yield* findStatus("Queued");
      yield* lookups.statuses.archive(queued.id);

      const error = yield* Effect.flip(items.setStatus(item.id, queued.id));

      expect(error.message).toBe("Status is missing or archived.");
      expect((yield* readItem(item.id)).StatusId).toBeNull();
    }),
  ),
);

it.effect("An editor save that sets Done completes sub-items as one status step", () =>
  withServices(
    Effect.gen(function* () {
      const { items, undo, create } = yield* setup;
      const parent = yield* create("Parent");
      const child = yield* create("Child", parent.id);
      const fields = {
        title: "Renamed parent",
        description: null,
        ticketNumber: null,
        itemTypeId: null,
        priorityLevelId: null,
        dueDate: null,
        dueTime: null,
        statusId: completedId,
      };

      const prompt = yield* items.edit(parent.id, fields);
      const unchanged = yield* readItem(parent.id);
      yield* items.edit(parent.id, fields, [], [child.id]);

      expect(prompt.kind).toBe("needs-confirmation");
      expect(unchanged.StatusId).toBeNull();
      expect((yield* readItem(parent.id)).StatusId).toBe(completedId);
      expect((yield* readItem(child.id)).StatusId).toBe(completedId);
      expect((yield* undo.status()).undo).toBe("Set status of 'Renamed parent'");

      yield* undo.apply("undo");

      expect(yield* readItem(child.id)).toEqual({
        StatusId: null,
        ReopenStatusId: null,
        CompletedAtUtc: null,
      });
    }),
  ),
);

it.effect("Status lookups and assignments can be undone and redone", () =>
  withServices(
    Effect.gen(function* () {
      const { lookups, items, undo, create, addStatus } = yield* setup;
      const item = yield* create("Report");
      const reviewed = yield* addStatus("Reviewed", "Done");
      yield* items.setStatus(item.id, reviewed.id);
      yield* lookups.statuses.archive(completedId);

      const refusal = yield* Effect.flip(lookups.statuses.archive(reviewed.id));
      yield* undo.apply("undo");
      yield* undo.apply("undo");
      const unassigned = yield* readItem(item.id);
      yield* undo.apply("undo");
      const removed = yield* lookups.statuses.list();
      yield* undo.apply("redo");
      yield* undo.apply("redo");

      expect(refusal.message).toBe("At least one Done status must stay active.");
      expect(unassigned.StatusId).toBeNull();
      expect(removed.some((row) => row.id === reviewed.id)).toBe(false);
      expect((yield* readItem(item.id)).StatusId).toBe(reviewed.id);
    }),
  ),
);

it.effect("Undoing an added status explains when a completed item remembers it", () =>
  withServices(
    Effect.gen(function* () {
      const { items, undo, sql, create, addStatus } = yield* setup;
      const item = yield* create("Report");
      yield* items.setStatus(item.id, completedId);
      const reviewed = yield* addStatus("Reviewed", "Open");
      yield* sql.withTransaction(
        sql`UPDATE TodoItem SET ReopenStatusId = ${reviewed.id} WHERE Id = ${item.id}`,
      );

      const problem = yield* Effect.flip(undo.apply("undo"));

      expect(problem.message).toContain("still used by an item");
      expect((yield* readItem(item.id)).ReopenStatusId).toBe(reviewed.id);
      expect((yield* undo.status()).undo).toBe("Add status 'Reviewed'");
    }),
  ),
);

it.effect("Archiving a status round-trips and keeps current and reopen references", () =>
  withServices(
    Effect.gen(function* () {
      const { lookups, items, undo, create, complete, addStatus } = yield* setup;
      const review = yield* addStatus("Review", "Open");
      const open = yield* create("Current status");
      const done = yield* create("Reopen status");
      yield* items.setStatus(open.id, review.id);
      yield* items.setStatus(done.id, review.id);
      yield* complete(done.id);

      yield* lookups.statuses.archive(review.id);
      const archived = yield* lookups.statuses.list();
      yield* undo.apply("undo");
      const restored = yield* lookups.statuses.list();
      yield* undo.apply("redo");

      expect(archived.find((row) => row.id === review.id)?.isArchived).toBe(true);
      expect(restored.find((row) => row.id === review.id)?.isArchived).toBe(false);
      expect(yield* lookups.statuses.list()).toEqual(archived);
      expect((yield* readItem(open.id)).StatusId).toBe(review.id);
      expect((yield* readItem(done.id)).ReopenStatusId).toBe(review.id);
    }),
  ),
);
