import { expect, it } from "@effect/vitest";
import { Effect, type Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { makeRpcClient } from "../../../web/src/rpc-client.js";
import { LoopbackRpc, loopbackRpcLayer } from "../../src/rpc/loopback-rpc.js";
import { FolderService } from "../../src/services/folder-service.js";
import { ProjectService } from "../../src/services/project-service.js";
import { withSchema } from "../db/store.js";

const timeZone = "America/New_York";
const rendererOrigin = "http://127.0.0.1:5173";
const createdAtUtc = "2026-11-13T12:00:00Z";
const rendererFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", rendererOrigin);
  return fetch(input, { ...init, headers });
};

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from(createdAtUtc).epochMilliseconds);
  const project = yield* Effect.flatMap(ProjectService, (projects) =>
    projects.create("Project"),
  ).pipe(Effect.provide(ProjectService.layer(timeZone)));
  const connection = yield* LoopbackRpc;
  const client = yield* makeRpcClient(connection);
  const area = { projectId: project.id.toLowerCase(), folderId: null };
  const create = (title: string, parentItemId: string | null = null) =>
    client.CreateItem({ ...area, parentItemId, title });
  return { client, area, create };
});

const withItemRpc = <A, E>(
  test: Effect.Effect<A, E, SqlClient.SqlClient | Scope.Scope | LoopbackRpc>,
) =>
  withSchema(
    Effect.scoped(
      test.pipe(
        Effect.provide(loopbackRpcLayer({ rendererOrigin, timeZone })),
        Effect.provideService(FetchHttpClient.Fetch, rendererFetch),
      ),
    ),
  );

it.effect("Edits and reads floating times and UTC timestamps through the renderer client", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const item = yield* create("Original");
      const { itemTypes, priorityLevels } = yield* client.LoadArea(area);
      const itemTypeId = itemTypes[0]?.id ?? "";
      const priorityLevelId = priorityLevels[0]?.id ?? "";
      const fields = {
        title: "Edited",
        description: "Description",
        ticketNumber: "T-7",
        itemTypeId: itemTypeId.toLowerCase(),
        priorityLevelId: priorityLevelId.toLowerCase(),
        dueDate: "2026-11-12",
        dueTime: "17:45:00.1234567",
        scheduledStart: "2026-11-14T09:30:00.1234567",
        scheduledEnd: "2026-11-14T10:30:00.1234567",
      };
      yield* TestClock.adjust("1 second");

      yield* client.EditItem({ itemId: item.id.toLowerCase(), fields });
      const saved = yield* client.LoadArea(area);

      expect(item.id).toMatch(/^[A-F0-9-]+$/);
      expect(saved.projectId).toBe(area.projectId.toUpperCase());
      expect(saved.items).toMatchObject([
        {
          item: {
            ...fields,
            id: item.id,
            itemTypeId,
            priorityLevelId,
            createdAtUtc,
            updatedAtUtc: "2026-11-13T12:00:01Z",
            completedAtUtc: null,
          },
          displayedUrgency: { value: "Overdue", sourceDescendantId: null },
        },
      ]);
      expect(saved.settings.autoCompleteParents).toEqual({ value: true, source: "Global" });
      expect(saved.settings.urgencyRedThreshold.value).toMatch(/^\d+$/);
    }),
  ),
);

it.effect(
  "Refreshes stale completion approval when the open descendants change at the same count",
  () =>
    withItemRpc(
      Effect.gen(function* () {
        const { client, area, create } = yield* setup;
        const parent = yield* create("Parent");
        const original = yield* create("Original", parent.id);
        const request = { ...area, itemId: parent.id, completed: true };
        const preview = yield* client.SetItemCompleted(request);
        expect(preview).toEqual({
          kind: "needs-confirmation",
          openSubItemCount: 1,
          openSubItemIds: [original.id],
        });
        if (preview.kind !== "needs-confirmation") return;

        const replacement = yield* create("Replacement", parent.id);
        yield* client.SetItemCompleted({ ...request, itemId: original.id });
        const refreshed = yield* client.SetItemCompleted({
          ...request,
          confirmedOpenItemIds: preview.openSubItemIds,
        });
        const unchanged = yield* client.LoadArea(area);
        expect(refreshed).toEqual({
          kind: "needs-confirmation",
          openSubItemCount: 1,
          openSubItemIds: [replacement.id],
        });
        expect(unchanged.items).toMatchObject([
          {
            item: { id: parent.id, completedAtUtc: null },
            children: [
              { item: { id: original.id, completedAtUtc: createdAtUtc } },
              { item: { id: replacement.id, completedAtUtc: null } },
            ],
          },
        ]);
        if (refreshed.kind !== "needs-confirmation") return;
        yield* TestClock.adjust("1 second");

        const applied = yield* client.SetItemCompleted({
          ...request,
          confirmedOpenItemIds: refreshed.openSubItemIds.map((id) => id.toLowerCase()),
        });
        const blocked = yield* client.SetItemCompleted({ ...request, completed: false });
        const finished = yield* client.LoadArea(area);

        const completedAtUtc = "2026-11-13T12:00:01Z";
        expect(applied).toMatchObject({
          kind: "applied",
          changes: expect.arrayContaining([
            { itemId: parent.id, completedAtUtc },
            { itemId: replacement.id, completedAtUtc },
          ]),
        });
        expect(blocked).toEqual({
          kind: "blocked",
          reason: "Reopen a sub-item instead, or add a new one.",
        });
        expect(finished.items).toMatchObject([
          {
            item: { id: parent.id, completedAtUtc },
            isFinished: true,
            children: [
              { item: { id: original.id, completedAtUtc: createdAtUtc } },
              { item: { id: replacement.id, completedAtUtc } },
            ],
          },
        ]);
      }),
    ),
);

it.effect("Moves, indents, outdents and reorders items while reconciling completion", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const parent = yield* create("Parent");
      const child = yield* create("Child");
      const sibling = yield* create("Sibling");
      yield* client.SetItemCompleted({ ...area, itemId: parent.id, completed: true });

      yield* client.IndentItem({ ...area, itemId: child.id });
      const indented = yield* client.LoadArea(area);
      yield* client.OutdentItem({ ...area, itemId: child.id });
      const outdented = yield* client.LoadArea(area);
      yield* client.MoveItem({ ...area, itemId: sibling.id, parentItemId: parent.id });
      yield* client.ReorderItems({ ...area, parentItemId: null, itemIds: [child.id, parent.id] });
      const reordered = yield* client.LoadArea(area);

      expect(indented.items[0]).toMatchObject({
        item: { id: parent.id, completedAtUtc: null },
        children: [{ item: { id: child.id, parentItemId: parent.id } }],
      });
      expect(outdented.items[2]).toMatchObject({
        item: { id: child.id, parentItemId: null, sortOrder: 2 },
      });
      expect(reordered.items).toMatchObject([
        { item: { id: child.id, parentItemId: null, sortOrder: 0 }, children: [] },
        {
          item: { id: parent.id, sortOrder: 1 },
          children: [{ item: { id: sibling.id, parentItemId: parent.id, sortOrder: 0 } }],
        },
      ]);
    }),
  ),
);

it.effect("Carries earlier deletion batches with a moved branch and restores them separately", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const folder = yield* Effect.flatMap(FolderService, (folders) =>
        folders.create(area.projectId, null, "Destination"),
      ).pipe(Effect.provide(FolderService.layer));
      const target = { ...area, folderId: folder.id.toLowerCase() };
      const parent = yield* create("Parent");
      const earlier = yield* create("Earlier", parent.id);
      const later = yield* create("Later", parent.id);
      const earlierBatch = yield* client.DeleteItem({ ...area, itemId: earlier.id });

      yield* client.MoveItemToArea({
        projectId: area.projectId,
        sourceFolderId: area.folderId,
        targetFolderId: target.folderId,
        itemId: parent.id,
      });
      const source = yield* client.LoadArea(area);
      const wrongArea = yield* Effect.flip(client.RestoreItems({ ...area, batchId: earlierBatch }));
      const laterBatch = yield* client.DeleteItem({ ...target, itemId: parent.id });
      const blocked = yield* Effect.flip(client.RestoreItems({ ...target, batchId: earlierBatch }));
      const deleted = yield* client.LoadArea(target);
      yield* client.RestoreItems({ ...target, batchId: laterBatch.toLowerCase() });
      const branch = yield* client.LoadArea(target);
      yield* client.RestoreItems({ ...target, batchId: earlierBatch });
      const restored = yield* client.LoadArea(target);

      expect(earlierBatch).toMatch(/^[A-F0-9-]+$/);
      expect(laterBatch).toMatch(/^[A-F0-9-]+$/);
      expect(laterBatch).not.toBe(earlierBatch);
      expect(source.items).toEqual([]);
      expect(wrongArea).toMatchObject({
        _tag: "ItemHierarchyError",
        message: expect.stringMatching(/not found/i),
      });
      expect(blocked).toMatchObject({
        _tag: "ItemHierarchyError",
        message: expect.stringMatching(/restore the parent/i),
      });
      expect(deleted.items).toEqual([]);
      expect(branch.items).toMatchObject([
        { item: { id: parent.id, folderId: folder.id }, children: [{ item: { id: later.id } }] },
      ]);
      expect(restored.items[0]?.children.map(({ item }) => item.id)).toEqual(
        expect.arrayContaining([earlier.id, later.id]),
      );
      expect(restored.items[0]?.children).toHaveLength(2);
      expect(
        restored.items[0]?.children.find(({ item }) => item.id === earlier.id)?.item,
      ).toMatchObject({ folderId: folder.id, deletedAtUtc: null, deletionBatchId: null });
    }),
  ),
);

it.effect("Returns a typed edit error and preserves the stored fields", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const item = yield* create("Original");
      const {
        title,
        description,
        ticketNumber,
        itemTypeId,
        priorityLevelId,
        dueDate,
        scheduledStart,
        scheduledEnd,
      } = item;

      const error = yield* Effect.flip(
        client.EditItem({
          itemId: item.id,
          fields: {
            title: "Rejected",
            description,
            ticketNumber,
            itemTypeId,
            priorityLevelId,
            dueDate,
            dueTime: "09:00",
            scheduledStart,
            scheduledEnd,
          },
        }),
      );
      const saved = yield* client.LoadArea(area);

      expect(error).toMatchObject({
        _tag: "ItemValidationError",
        message: "Due time requires a due date.",
      });
      expect(saved.items).toMatchObject([{ item: { id: item.id, title, dueTime: null } }]);
    }),
  ),
);

it.effect("Rolls back a failed confirmed completion and lets the caller retry", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const sql = yield* SqlClient.SqlClient;
      const parent = yield* create("Parent");
      const child = yield* create("Child", parent.id);
      const request = { ...area, itemId: parent.id, completed: true };
      const preview = yield* client.SetItemCompleted(request);
      expect(preview.kind).toBe("needs-confirmation");
      if (preview.kind !== "needs-confirmation") return;
      const confirmation = { ...request, confirmedOpenItemIds: preview.openSubItemIds };
      yield* sql`CREATE TRIGGER reject_second_completion BEFORE UPDATE OF CompletedAtUtc ON TodoItem
        WHEN NEW.CompletedAtUtc IS NOT NULL AND EXISTS (
          SELECT 1 FROM TodoItem WHERE CompletedAtUtc IS NOT NULL
        )
        BEGIN SELECT RAISE(ABORT, 'second completion failed'); END`;

      const failure = yield* Effect.flip(client.SetItemCompleted(confirmation));
      const saved = yield* client.LoadArea(area);
      yield* sql`DROP TRIGGER reject_second_completion`;
      const retry = yield* client.SetItemCompleted(confirmation);

      expect(failure).toMatchObject({
        _tag: "ItemStorageError",
        message: "Could not complete the item operation.",
      });
      expect(saved.items).toMatchObject([
        {
          item: { id: parent.id, completedAtUtc: null },
          children: [{ item: { id: child.id, completedAtUtc: null } }],
        },
      ]);
      expect(retry.kind).toBe("applied");
    }),
  ),
);
