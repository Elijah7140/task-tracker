import { expect, it } from "@effect/vitest";
import { Effect, type Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { makeRpcClient } from "../../../web/src/rpc-client.js";
import { LoopbackRpc, loopbackRpcLayer } from "../../src/rpc/loopback-rpc.js";
import { itemId, seedItem, withSchema } from "../db/services/fixtures.js";

const rendererOrigin = "http://127.0.0.1:5173";
const server = loopbackRpcLayer({ rendererOrigin, timeZone: "America/New_York" });

const rendererFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", rendererOrigin);
  return fetch(input, { ...init, headers });
};

const withWorkspaceRpc = <Value, Error>(
  test: Effect.Effect<Value, Error, LoopbackRpc | Scope.Scope | SqlClient.SqlClient>,
) =>
  withSchema(
    // Pin the clock before the reminder scheduler starts with the server.
    Effect.andThen(
      TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds),
      Effect.scoped(
        test.pipe(
          Effect.provide(server),
          Effect.provideService(FetchHttpClient.Fetch, rendererFetch),
        ),
      ),
    ),
  );

const connect = LoopbackRpc.pipe(Effect.flatMap(makeRpcClient));

it.effect("Opens a project from home and reads its nested folder navigation", () =>
  withWorkspaceRpc(
    Effect.gen(function* () {
      yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
      const client = yield* connect;
      const project = yield* client.CreateProject({ name: " Billing " });
      const parent = yield* client.CreateFolder({
        projectId: project.id.toLowerCase(),
        parentFolderId: null,
        name: "dbo",
      });
      const child = yield* client.CreateFolder({
        projectId: project.id,
        parentFolderId: parent.id.toLowerCase(),
        name: "Tables",
      });
      yield* seedItem(project.id, { Id: itemId, FolderId: child.id, DueDate: "2026-11-12" });

      const home = yield* client.ListProjects();
      const workspace = yield* client.LoadWorkspace({ projectId: project.id.toLowerCase() });

      expect(home).toEqual([{ project, openCount: 1, overdueCount: 1 }]);
      expect(project.createdAtUtc).toBe("2026-11-13T12:00:00Z");
      expect(project.id).toMatch(/^[0-9A-F-]{36}$/);
      expect(workspace).toEqual({
        projectId: project.id,
        name: "Billing",
        folders: [parent, child],
      });
      expect(child.parentFolderId).toBe(parent.id);
      expect(child.createdAtUtc).toBe("2026-11-13T12:00:00Z");
    }),
  ),
);

it.effect("Renames and reorders projects and rejects an incomplete project order", () =>
  withWorkspaceRpc(
    Effect.gen(function* () {
      const client = yield* connect;
      const first = yield* client.CreateProject({ name: "Billing" });
      const second = yield* client.CreateProject({ name: "Inventory" });

      yield* client.RenameProject({ projectId: first.id.toLowerCase(), name: "Invoicing" });
      yield* client.ReorderProjects({ projectIds: [second.id, first.id.toLowerCase()] });
      const rejected = yield* Effect.flip(client.ReorderProjects({ projectIds: [first.id] }));
      const home = yield* client.ListProjects();

      expect(rejected).toMatchObject({
        _tag: "RuleViolation",
        message: expect.stringContaining("every active project"),
      });
      expect(home.map(({ project }) => [project.id, project.name, project.sortOrder])).toEqual([
        [second.id, "Inventory", 0],
        [first.id, "Invoicing", 1],
      ]);
    }),
  ),
);

it.effect("Persists folder edits and rejects moves into descendants or another project", () =>
  withWorkspaceRpc(
    Effect.gen(function* () {
      const client = yield* connect;
      const { id: projectId } = yield* client.CreateProject({ name: "Billing" });
      const other = yield* client.CreateProject({ name: "Other" });
      const parent = yield* client.CreateFolder({ projectId, parentFolderId: null, name: "dbo" });
      const target = yield* client.CreateFolder({
        projectId,
        parentFolderId: null,
        name: "Archive",
      });
      const child = yield* client.CreateFolder({
        projectId,
        parentFolderId: parent.id,
        name: "Tables",
      });
      const foreign = yield* client.CreateFolder({
        projectId: other.id,
        parentFolderId: null,
        name: "Foreign",
      });
      yield* client.RenameFolder({ projectId, folderId: child.id, name: "Invoices" });
      yield* client.MoveFolder({ projectId, folderId: child.id, parentFolderId: target.id });
      yield* client.ReorderFolders({
        projectId,
        parentFolderId: null,
        folderIds: [target.id, parent.id],
      });

      const cycle = yield* Effect.flip(
        client.MoveFolder({ projectId, folderId: target.id, parentFolderId: child.id }),
      );
      const crossProject = yield* Effect.flip(
        client.MoveFolder({ projectId, folderId: child.id, parentFolderId: foreign.id }),
      );
      const workspace = yield* client.LoadWorkspace({ projectId });

      expect(cycle).toMatchObject({
        _tag: "RuleViolation",
        message: expect.stringContaining("cycle"),
      });
      expect(crossProject).toMatchObject({
        _tag: "NotFound",
        entity: "Folder",
        message: expect.stringContaining("missing or deleted"),
      });
      expect(workspace.folders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: target.id, parentFolderId: null, sortOrder: 0 }),
          expect.objectContaining({ id: parent.id, parentFolderId: null, sortOrder: 1 }),
          expect.objectContaining({ id: child.id, parentFolderId: target.id, name: "Invoices" }),
        ]),
      );
    }),
  ),
);

it.effect("Hides a deleted workspace and restores the project with its active descendants", () =>
  withWorkspaceRpc(
    Effect.gen(function* () {
      const client = yield* connect;
      const project = yield* client.CreateProject({ name: "Billing" });
      const other = yield* client.CreateProject({ name: "Inventory" });
      const parent = yield* client.CreateFolder({
        projectId: project.id,
        parentFolderId: null,
        name: "dbo",
      });
      const child = yield* client.CreateFolder({
        projectId: project.id,
        parentFolderId: parent.id,
        name: "Tables",
      });
      yield* seedItem(project.id, { Id: itemId, FolderId: child.id });

      const batchId = yield* client.DeleteProject({ projectId: project.id });
      const hidden = yield* Effect.flip(client.LoadWorkspace({ projectId: project.id }));
      const remaining = yield* client.ListProjects();
      yield* client.RestoreProject({ batchId: batchId.toLowerCase() });
      const restored = yield* client.LoadWorkspace({ projectId: project.id });
      const restoredBatch = yield* Effect.flip(client.RestoreProject({ batchId }));
      const home = yield* client.ListProjects();

      expect(batchId).toMatch(/^[0-9A-F-]{36}$/);
      expect(hidden).toMatchObject({
        _tag: "NotFound",
        entity: "Project",
        message: "Project is missing or deleted.",
      });
      expect(restoredBatch).toMatchObject({ _tag: "NotFound", entity: "DeletionBatch" });
      expect(remaining.map(({ project }) => project.id)).toEqual([other.id]);
      expect(restored.folders.map(({ id, parentFolderId }) => [id, parentFolderId])).toEqual([
        [parent.id, null],
        [child.id, parent.id],
      ]);
      expect(home.find((summary) => summary.project.id === project.id)?.openCount).toBe(1);
    }),
  ),
);

it.effect("Restores only the folder batch in its owning project after its parent is active", () =>
  withWorkspaceRpc(
    Effect.gen(function* () {
      const client = yield* connect;
      const { id: projectId } = yield* client.CreateProject({ name: "Billing" });
      const other = yield* client.CreateProject({ name: "Inventory" });
      const parent = yield* client.CreateFolder({ projectId, parentFolderId: null, name: "dbo" });
      const child = yield* client.CreateFolder({
        projectId,
        parentFolderId: parent.id,
        name: "Tables",
      });
      const older = yield* client.CreateFolder({
        projectId,
        parentFolderId: parent.id,
        name: "Older",
      });
      yield* seedItem(projectId, { Id: itemId, FolderId: child.id });
      const earlierBatch = yield* client.DeleteFolder({ projectId, folderId: older.id });

      const batchId = yield* client.DeleteFolder({ projectId, folderId: parent.id });
      const foreign = yield* Effect.flip(client.RestoreFolder({ projectId: other.id, batchId }));
      const outOfOrder = yield* Effect.flip(
        client.RestoreFolder({ projectId, batchId: earlierBatch }),
      );
      const deleted = yield* client.LoadWorkspace({ projectId });
      const hiddenHome = yield* client.ListProjects();
      yield* client.RestoreFolder({ projectId, batchId: batchId.toLowerCase() });
      const restored = yield* client.LoadWorkspace({ projectId });
      const restoredHome = yield* client.ListProjects();
      yield* client.RestoreFolder({ projectId, batchId: earlierBatch });
      const all = yield* client.LoadWorkspace({ projectId });

      expect(foreign).toMatchObject({
        _tag: "NotFound",
        entity: "DeletionBatch",
        message: "Folder deletion batch was not found.",
      });
      expect(outOfOrder).toMatchObject({
        _tag: "RuleViolation",
        message: "Restore the parent folder first.",
      });
      expect(deleted.folders).toEqual([]);
      expect(hiddenHome.find((summary) => summary.project.id === projectId)?.openCount).toBe(0);
      expect(restored.folders.map(({ id }) => id)).toEqual([parent.id, child.id]);
      expect(restoredHome.find((summary) => summary.project.id === projectId)?.openCount).toBe(1);
      expect(all.folders.find(({ id }) => id === older.id)?.parentFolderId).toBe(parent.id);
    }),
  ),
);

it.effect(
  "Reports a failed write without exposing SQLite details and preserves the workspace",
  () =>
    withWorkspaceRpc(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const client = yield* connect;
        const { id: projectId } = yield* client.CreateProject({ name: "Billing" });
        const folder = yield* client.CreateFolder({ projectId, parentFolderId: null, name: "dbo" });
        yield* seedItem(projectId, { Id: itemId, FolderId: folder.id });
        yield* sql.withTransaction(sql`CREATE TRIGGER reject_item_delete BEFORE UPDATE OF DeletedAtUtc ON TodoItem
        BEGIN SELECT RAISE(ABORT, 'unexpected write failure'); END`);

        const failure = yield* Effect.flip(client.DeleteFolder({ projectId, folderId: folder.id }));
        const workspace = yield* client.LoadWorkspace({ projectId });
        const home = yield* client.ListProjects();

        expect(failure).toMatchObject({
          _tag: "OperationFailed",
          message: "The operation could not be completed.",
        });
        expect(workspace.folders).toEqual([folder]);
        expect(home[0]?.openCount).toBe(1);
      }),
    ),
);
