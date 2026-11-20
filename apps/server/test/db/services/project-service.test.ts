import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FolderService } from "../../../src/services/folder-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import type { UndoService } from "../../../src/services/undo-service.js";
import { roundTrip } from "./undo-round-trip.js";
import {
  childItemId,
  itemId,
  readItems,
  seedItem,
  setAutoComplete,
  timestamp,
  withSchema,
} from "./fixtures.js";

const withServices = <A, E>(
  test: Effect.Effect<A, E, ProjectService | FolderService | SqlClient.SqlClient | UndoService>,
) =>
  test.pipe(
    Effect.provide(ProjectService.layer("UTC")),
    Effect.provide(FolderService.layer),
    withSchema,
  );

it.effect("Restoring a project reopens a completed parent with an open child", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const project = yield* projects.create("Project");
      yield* setAutoComplete(false);
      yield* seedItem(project.id, { Id: itemId, CompletedAtUtc: timestamp });
      yield* seedItem(project.id, { Id: childItemId, ParentItemId: itemId });
      const batch = yield* projects.delete(project.id);
      yield* setAutoComplete(true);

      yield* projects.restore(batch);
      const rows = yield* readItems();

      expect(rows[0]).toMatchObject({ Id: itemId, CompletedAtUtc: null, DeletedAtUtc: null });
    }),
  ),
);

it.effect("Project creation, rename and reorder persist across operations", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const first = yield* projects.create("First");
      const second = yield* projects.create("Second");

      yield* projects.rename(first.id.toLowerCase(), " Renamed ");
      yield* projects.reorder([second.id, first.id]);
      const saved = yield* projects.list();

      expect(saved.map(({ project }) => project.id)).toEqual([second.id, first.id]);
      expect(saved[1]?.project.name).toBe("Renamed");
      expect(first.id).toMatch(
        /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/,
      );
    }),
  ),
);

it.effect(
  "Deleting a project stamps its folders and items in one batch and restores them together",
  () =>
    withServices(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const projects = yield* ProjectService;
        const folders = yield* FolderService;
        const project = yield* projects.create("Project");
        const folder = yield* folders.create(project.id, null, "Folder");
        yield* seedItem(project.id, { Id: itemId, FolderId: folder.id });

        const batch = yield* projects.delete(project.id);
        const deleted = yield* sql.withTransaction(sql`SELECT DeletionBatchId FROM Project
      UNION ALL SELECT DeletionBatchId FROM Folder UNION ALL SELECT DeletionBatchId FROM TodoItem`);
        expect(deleted).toEqual(Array.from({ length: 3 }, () => ({ DeletionBatchId: batch })));
        expect(yield* projects.list()).toEqual([]);

        yield* projects.restore(batch);
        const snapshot = yield* projects.loadWorkspace(project.id);
        const items = yield* readItems();

        expect(snapshot.folders.all.map((row) => row.id)).toEqual([folder.id]);
        expect(items).toMatchObject([{ Id: itemId, DeletedAtUtc: null, DeletionBatchId: null }]);
      }),
    ),
);

it.effect("Project summaries count open and overdue items", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const project = yield* projects.create("Project");
      yield* seedItem(project.id, { Id: itemId, DueDate: "2026-11-12" });
      yield* seedItem(project.id, { Id: childItemId, CompletedAtUtc: timestamp });
      yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);

      const summaries = yield* projects.list();

      expect(summaries).toMatchObject([
        { project: { id: project.id }, openCount: 1, overdueCount: 1 },
      ]);
    }),
  ),
);

it.effect("A failed completion write rolls back the entire project restore", () =>
  withServices(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const projects = yield* ProjectService;
      const folders = yield* FolderService;
      const project = yield* projects.create("Project");
      const folder = yield* folders.create(project.id, null, "Folder");
      yield* seedItem(project.id, { Id: itemId, FolderId: folder.id, CompletedAtUtc: timestamp });
      yield* seedItem(project.id, { Id: childItemId, FolderId: folder.id, ParentItemId: itemId });
      const batch = yield* projects.delete(project.id);
      yield* sql`CREATE TRIGGER fail_completion BEFORE UPDATE OF CompletedAtUtc ON TodoItem
      BEGIN SELECT RAISE(ABORT, 'completion write failed'); END`;

      const error = yield* Effect.flip(projects.restore(batch));
      const items = yield* readItems();

      expect(error.message).toContain("completion write failed");
      expect(yield* projects.list()).toEqual([]);
      expect(yield* sql.withTransaction(sql`SELECT DeletionBatchId FROM Folder`)).toEqual([
        { DeletionBatchId: batch },
      ]);
      expect(items).toMatchObject([
        { Id: itemId, DeletionBatchId: batch, CompletedAtUtc: timestamp },
        { Id: childItemId, DeletionBatchId: batch },
      ]);
    }),
  ),
);

it.effect("Changing a project icon is one undo step and an invalid key changes nothing", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const project = yield* projects.create("Billing DB");

      const { label, after, undone } = yield* roundTrip(projects.setIcon(project.id, "database"), [
        "Project",
      ]);
      const refused = yield* Effect.flip(projects.setIcon(project.id, "Not A Key"));
      const [listed] = yield* projects.list();

      expect(label).toBe("Change icon of 'Billing DB'");
      expect(after[0]![0]!["IconKey"]).toBe("database");
      expect(undone[0]![0]!["IconKey"]).toBeNull();
      expect(refused.message).toBe("Icon must be a short lowercase name such as 'database'.");
      expect(listed?.project.iconKey).toBe("database");
    }),
  ),
);
