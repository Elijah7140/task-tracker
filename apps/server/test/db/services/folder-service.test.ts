import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { FolderService } from "../../../src/services/folder-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
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
  test: Effect.Effect<A, E, ProjectService | FolderService | SqlClient.SqlClient>,
) =>
  test.pipe(
    Effect.provide(ProjectService.layer("UTC")),
    Effect.provide(FolderService.layer),
    withSchema,
  );

it.effect("Moving a folder out and creating another keeps sibling order contiguous", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const folders = yield* FolderService;
      const project = yield* projects.create("Project");
      const first = yield* folders.create(project.id, null, "A");
      const second = yield* folders.create(project.id, null, "B");
      const third = yield* folders.create(project.id, null, "C");

      yield* folders.move(project.id, first.id, second.id);
      const fourth = yield* folders.create(project.id, null, "D");
      const roots = (yield* projects.loadWorkspace(project.id)).folders.children(null);

      expect(roots.map((row) => row.id)).toEqual([second.id, third.id, fourth.id]);
      expect(roots.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
    }),
  ),
);

it.effect("Restoring a folder reopens a completed parent with an open child", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const folders = yield* FolderService;
      const project = yield* projects.create("Project");
      const folder = yield* folders.create(project.id, null, "Area");
      yield* setAutoComplete(false);
      yield* seedItem(project.id, { Id: itemId, FolderId: folder.id, CompletedAtUtc: timestamp });
      yield* seedItem(project.id, { Id: childItemId, FolderId: folder.id, ParentItemId: itemId });
      const batch = yield* folders.delete(project.id, folder.id);
      yield* setAutoComplete(true);

      yield* folders.restore(project.id, batch);
      const rows = yield* readItems();

      expect(rows[0]).toMatchObject({ Id: itemId, CompletedAtUtc: null });
    }),
  ),
);

it.effect("An earlier deletion batch stays deleted until its parent has been restored", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const folders = yield* FolderService;
      const project = yield* projects.create("Project");
      const parent = yield* folders.create(project.id, null, "Parent");
      const child = yield* folders.create(project.id, parent.id, "Child");
      const childBatch = yield* folders.delete(project.id, child.id);
      const parentBatch = yield* folders.delete(project.id, parent.id);

      const error = yield* Effect.flip(folders.restore(project.id, childBatch));
      yield* folders.restore(project.id, parentBatch);
      const restored = yield* projects.loadWorkspace(project.id);

      expect(error.message).toBe("Restore the parent folder first.");
      expect(restored.folders.all.map((row) => row.id)).toEqual([parent.id]);

      yield* folders.restore(project.id, childBatch);
      expect((yield* projects.loadWorkspace(project.id)).folders.children(parent.id)[0]?.id).toBe(
        child.id,
      );
    }),
  ),
);

it.effect("Folder edits persist and moves reject cycles and cross-project targets", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const folders = yield* FolderService;
      const project = yield* projects.create("First");
      const other = yield* projects.create("Second");
      const first = yield* folders.create(project.id, null, "First");
      const second = yield* folders.create(project.id, null, "Second");
      const child = yield* folders.create(project.id, first.id, "Child");
      const foreign = yield* folders.create(other.id, null, "Foreign");

      const cycle = yield* Effect.flip(folders.move(project.id, first.id, child.id));
      const crossing = yield* Effect.flip(folders.move(project.id, first.id, foreign.id));
      yield* folders.rename(project.id, child.id, "Renamed");
      yield* folders.move(project.id, child.id, second.id);
      yield* folders.reorder(project.id, null, [second.id, first.id]);
      const { folders: saved } = yield* projects.loadWorkspace(project.id);

      expect(cycle.message).toContain("cycle");
      expect(crossing.message).toContain("missing or deleted");
      expect(saved.get(child.id)).toMatchObject({ parentFolderId: second.id, name: "Renamed" });
      expect(saved.get(second.id).sortOrder).toBe(0);
    }),
  ),
);

it.effect("Deleting a folder stamps the subtree and its items and restores them together", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const folders = yield* FolderService;
      const project = yield* projects.create("Project");
      const other = yield* projects.create("Other");
      const parent = yield* folders.create(project.id, null, "Parent");
      const child = yield* folders.create(project.id, parent.id, "Child");
      yield* seedItem(project.id, { Id: itemId, FolderId: child.id });

      const batch = yield* folders.delete(project.id, parent.id);
      expect((yield* projects.loadWorkspace(project.id)).folders.all).toEqual([]);
      expect(yield* readItems()).toMatchObject([{ Id: itemId, DeletionBatchId: batch }]);
      expect((yield* Effect.flip(folders.restore(other.id, batch))).message).toContain(
        "batch was not found",
      );
      yield* folders.restore(project.id, batch);
      const restored = yield* projects.loadWorkspace(project.id);

      expect(restored.folders.all.map((row) => row.id)).toEqual(
        expect.arrayContaining([parent.id, child.id]),
      );
      expect(yield* readItems()).toMatchObject([
        { Id: itemId, DeletedAtUtc: null, DeletionBatchId: null },
      ]);
    }),
  ),
);

it.effect("Restoring a folder renumbers its active siblings", () =>
  withServices(
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const folders = yield* FolderService;
      const project = yield* projects.create("Project");
      const first = yield* folders.create(project.id, null, "A");
      const second = yield* folders.create(project.id, null, "B");
      const third = yield* folders.create(project.id, null, "C");
      const batch = yield* folders.delete(project.id, second.id);

      yield* folders.restore(project.id, batch);
      const siblings = (yield* projects.loadWorkspace(project.id)).folders.children(null);

      expect(siblings.map(({ id, sortOrder }) => ({ id, sortOrder }))).toEqual([
        { id: first.id, sortOrder: 0 },
        { id: second.id, sortOrder: 1 },
        { id: third.id, sortOrder: 2 },
      ]);
    }),
  ),
);
