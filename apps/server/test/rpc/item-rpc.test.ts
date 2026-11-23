import { expect, it } from "@effect/vitest";
import { Effect, type Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { makeRpcClient } from "../../../web/src/rpc-client.js";
import { LoopbackRpc, loopbackRpcLayer } from "../../src/rpc/loopback-rpc.js";
import { FolderService } from "../../src/services/folder-service.js";
import { ProjectService } from "../../src/services/project-service.js";
import type { UndoService } from "../../src/services/undo-service.js";
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
  test: Effect.Effect<A, E, SqlClient.SqlClient | Scope.Scope | LoopbackRpc | UndoService>,
) =>
  withSchema(
    // Pin the clock before the reminder scheduler starts with the server.
    Effect.andThen(
      TestClock.setTime(Temporal.Instant.from(createdAtUtc).epochMilliseconds),
      Effect.scoped(
        test.pipe(
          Effect.provide(loopbackRpcLayer({ rendererOrigin, timeZone })),
          Effect.provideService(FetchHttpClient.Fetch, rendererFetch),
        ),
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
      expect(saved.items.open).toMatchObject([
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
        expect(unchanged.items.open).toMatchObject([
          {
            item: { id: parent.id, completedAtUtc: null },
            children: {
              open: [{ item: { id: replacement.id, completedAtUtc: null } }],
              finished: [{ item: { id: original.id, completedAtUtc: createdAtUtc } }],
            },
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
        expect(finished.items).toMatchObject({
          open: [],
          finished: [
            {
              item: { id: parent.id, completedAtUtc },
              isFinished: true,
              children: {
                open: [],
                finished: [
                  { item: { id: replacement.id, completedAtUtc } },
                  { item: { id: original.id, completedAtUtc: createdAtUtc } },
                ],
              },
            },
          ],
        });
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

      expect(indented.items.open[0]).toMatchObject({
        item: { id: parent.id, completedAtUtc: null },
        children: { open: [{ item: { id: child.id, parentItemId: parent.id } }] },
      });
      expect(outdented.items.open[1]).toMatchObject({
        item: { id: child.id, parentItemId: null, sortOrder: 1 },
      });
      expect(reordered.items.open).toMatchObject([
        {
          item: { id: child.id, parentItemId: null, sortOrder: 0 },
          children: { open: [], finished: [] },
        },
        {
          item: { id: parent.id, sortOrder: 1 },
          children: { open: [{ item: { id: sibling.id, parentItemId: parent.id, sortOrder: 0 } }] },
        },
      ]);
    }),
  ),
);

it.effect("Creates an item right after a sibling as one undoable step", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const parent = yield* create("Parent");
      const first = yield* create("First", parent.id);
      const last = yield* create("Last", parent.id);

      const inserted = yield* client.CreateItem({
        ...area,
        parentItemId: parent.id,
        title: "Middle",
        afterItemId: first.id,
      });
      const placed = yield* client.LoadArea(area);
      const history = yield* client.GetHistory();
      yield* client.ApplyHistory({ direction: "undo" });
      const undone = yield* client.LoadArea(area);
      const refused = yield* Effect.flip(
        client.CreateItem({ ...area, parentItemId: null, title: "Stray", afterItemId: first.id }),
      );

      expect(placed.items.open[0]?.children.open.map((node) => node.item.id)).toEqual([
        first.id,
        inserted.id,
        last.id,
      ]);
      expect(history.undo).toBe("Create 'Middle'");
      expect(undone.items.open[0]?.children.open.map((node) => node.item.id)).toEqual([
        first.id,
        last.id,
      ]);
      expect(refused).toMatchObject({ _tag: "RuleViolation" });
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
      expect(source.items).toEqual({ open: [], finished: [] });
      expect(wrongArea).toMatchObject({
        _tag: "NotFound",
        entity: "DeletionBatch",
        message: expect.stringMatching(/not found/i),
      });
      expect(blocked).toMatchObject({
        _tag: "RuleViolation",
        message: expect.stringMatching(/restore the parent/i),
      });
      expect(deleted.items).toEqual({ open: [], finished: [] });
      expect(branch.items.open).toMatchObject([
        {
          item: { id: parent.id, folderId: folder.id },
          children: { open: [{ item: { id: later.id } }] },
        },
      ]);
      expect(restored.items.open[0]?.children.open.map(({ item }) => item.id)).toEqual(
        expect.arrayContaining([earlier.id, later.id]),
      );
      expect(restored.items.open[0]?.children.open).toHaveLength(2);
      expect(
        restored.items.open[0]?.children.open.find(({ item }) => item.id === earlier.id)?.item,
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
        _tag: "RuleViolation",
        message: "Due time requires a due date.",
      });
      expect(saved.items.open).toMatchObject([{ item: { id: item.id, title, dueTime: null } }]);
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
        _tag: "OperationFailed",
        message: "The operation could not be completed.",
      });
      expect(saved.items.open).toMatchObject([
        {
          item: { id: parent.id, completedAtUtc: null },
          children: { open: [{ item: { id: child.id, completedAtUtc: null } }] },
        },
      ]);
      expect(retry.kind).toBe("applied");
    }),
  ),
);

it.effect("Identifies a deleted item in both edit and completion requests", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const item = yield* create("Deleted");
      yield* client.DeleteItem({ ...area, itemId: item.id });

      const edit = yield* Effect.flip(
        client.EditItem({
          itemId: item.id,
          fields: {
            title: "Edited",
            description: null,
            ticketNumber: null,
            itemTypeId: null,
            priorityLevelId: null,
            dueDate: null,
            dueTime: null,
            scheduledStart: null,
            scheduledEnd: null,
          },
        }),
      );
      const completion = yield* Effect.flip(
        client.SetItemCompleted({ ...area, itemId: item.id, completed: true }),
      );

      expect(edit).toMatchObject({ _tag: "NotFound", entity: "Item" });
      expect(completion).toMatchObject({ _tag: "NotFound", entity: "Item" });
    }),
  ),
);

it.effect.each(["malformed", "P999999999D"])(
  "Hides the stored duration diagnostic for %s",
  (value) =>
    withItemRpc(
      Effect.gen(function* () {
        const { client, area } = yield* setup;
        const sql = yield* SqlClient.SqlClient;
        yield* sql`INSERT INTO GlobalSetting (Key, Value) VALUES ('urgencyYellowThreshold', ${value})
          ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value`;

        const failure = yield* Effect.flip(client.LoadArea(area));

        expect(failure).toMatchObject({
          _tag: "OperationFailed",
          message: "The operation could not be completed.",
        });
      }),
    ),
);

it.effect("Sets and clears an item's priority as one undoable step with projected labels", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const item = yield* create("Task");
      const seven = yield* client.AddPriorityLevel({ name: "", number: 7 });

      yield* client.SetItemPriority({ itemId: item.id.toLowerCase(), priorityLevelId: seven.id });
      const assigned = yield* client.LoadArea(area);
      const history = yield* client.GetHistory();
      yield* client.ApplyHistory({ direction: "undo" });
      const undone = yield* client.LoadArea(area);
      yield* client.ArchivePriorityLevel({ id: seven.id });
      const refused = yield* Effect.flip(
        client.SetItemPriority({ itemId: item.id, priorityLevelId: seven.id }),
      );

      expect(assigned.items.open[0]?.item).toEqual({ ...item, priorityLevelId: seven.id });
      expect(assigned.priorityLevels).toContainEqual(seven);
      expect(history.undo).toBe("Set priority of 'Task'");
      expect(undone.items.open[0]?.item.priorityLevelId).toBeNull();
      expect(refused).toMatchObject({
        _tag: "RuleViolation",
        message: "Priority is missing or archived.",
      });
    }),
  ),
);

it.effect("A Done status confirms descendants and an Open status reopens their ancestors", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const root = yield* create("Root");
      const parent = yield* create("Parent", root.id);
      const leaf = yield* create("Leaf", parent.id);
      const statuses = yield* client.ListStatuses();
      const queued = statuses.find(({ name }) => name === "Queued")!;
      const done = statuses.find(({ name }) => name === "Completed")!;
      const released = yield* client.AddStatus({ name: "Released", kind: "Done" });
      yield* client.SetItemStatus({ itemId: root.id, statusId: queued.id });
      yield* client.SetItemStatus({ itemId: parent.id, statusId: queued.id });

      const prompt = yield* client.SetItemStatus({ itemId: parent.id, statusId: released.id });
      expect(prompt).toEqual({
        kind: "needs-confirmation",
        openSubItemCount: 1,
        openSubItemIds: [leaf.id],
      });
      const before = yield* client.LoadArea(area);
      expect(before.items.open[0]?.children.open[0]?.item.statusId).toBe(queued.id);
      yield* client.SetItemStatus({
        itemId: parent.id,
        statusId: released.id,
        confirmedOpenItemIds: [leaf.id],
      });
      const completed = yield* client.LoadArea(area);
      expect(completed.items.finished).toMatchObject([
        {
          item: { statusId: done.id, reopenStatusId: queued.id },
          children: {
            finished: [
              {
                item: { statusId: released.id, reopenStatusId: queued.id },
                children: { finished: [{ item: { statusId: done.id } }] },
              },
            ],
          },
        },
      ]);
      expect(yield* client.SetItemStatus({ itemId: parent.id, statusId: null })).toMatchObject({
        kind: "blocked",
        reason: "Reopen a sub-item instead, or add a new one.",
      });

      yield* client.SetItemStatus({ itemId: leaf.id, statusId: queued.id });
      const reopened = yield* client.LoadArea(area);

      expect(reopened.items.open).toMatchObject([
        {
          item: { statusId: queued.id, reopenStatusId: null, completedAtUtc: null },
          children: { open: [{ item: { statusId: queued.id, reopenStatusId: null } }] },
        },
      ]);
    }),
  ),
);

it.effect(
  "An editor status change asks first, records one step and refuses archived statuses",
  () =>
    withItemRpc(
      Effect.gen(function* () {
        const { client, area, create } = yield* setup;
        const parent = yield* create("Parent");
        const child = yield* create("Child", parent.id);
        const statuses = yield* client.ListStatuses();
        const done = statuses.find(({ kind }) => kind === "Done")!;
        const blocked = yield* client.AddStatus({ name: "Blocked", kind: "Open" });
        yield* client.ArchiveStatus({ id: blocked.id });
        const fields = {
          title: "Renamed parent",
          description: null,
          ticketNumber: null,
          itemTypeId: null,
          priorityLevelId: null,
          dueDate: null,
          dueTime: null,
          scheduledStart: null,
          scheduledEnd: null,
          statusId: done.id,
        };

        const prompt = yield* client.EditItem({ itemId: parent.id, fields });
        const unchanged = yield* client.LoadArea(area);
        const applied = yield* client.EditItem({
          itemId: parent.id,
          fields,
          confirmedOpenItemIds: [child.id],
        });
        const history = yield* client.GetHistory();
        const archived = yield* Effect.flip(
          client.SetItemStatus({ itemId: child.id, statusId: blocked.id }),
        );
        yield* client.DeleteItem({ ...area, itemId: child.id });
        const missing = yield* Effect.flip(
          client.SetItemStatus({ itemId: child.id, statusId: null }),
        );

        expect(prompt).toEqual({
          kind: "needs-confirmation",
          openSubItemCount: 1,
          openSubItemIds: [child.id],
        });
        expect(unchanged.items.open[0]?.item).toMatchObject({ title: "Parent", statusId: null });
        expect(applied.kind).toBe("applied");
        expect(history.undo).toBe("Set status of 'Renamed parent'");
        expect(archived).toMatchObject({
          _tag: "RuleViolation",
          message: "Status is missing or archived.",
        });
        expect(missing).toMatchObject({ _tag: "NotFound", entity: "Item" });
      }),
    ),
);

it.effect("Saves, reorders and reads item links through the renderer client", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, create } = yield* setup;
      const item = yield* create("Linked");
      const fields = {
        title: "Linked",
        description: null,
        ticketNumber: null,
        itemTypeId: null,
        priorityLevelId: null,
        dueDate: null,
        dueTime: null,
        scheduledStart: null,
        scheduledEnd: null,
      };
      const itemId = item.id.toLowerCase();
      yield* client.EditItem({
        itemId,
        fields,
        links: [
          { id: null, url: " https://a.example ", title: " Aye " },
          { id: null, url: "mailto:team@example.com", title: null },
        ],
      });
      const saved = yield* client.LoadItemLinks({ itemId });

      yield* client.EditItem({
        itemId,
        fields,
        links: saved
          .toReversed()
          .map(({ id, url, title }) => ({ id: id.toLowerCase(), url, title })),
      });
      const reordered = yield* client.LoadItemLinks({ itemId });
      const invalid = yield* Effect.flip(
        client.EditItem({ itemId, fields, links: [{ id: null, url: "file:///x", title: null }] }),
      );
      const missing = yield* Effect.flip(
        client.LoadItemLinks({ itemId: "019A0000-0000-7000-8000-000000000FFF" }),
      );

      expect(saved).toMatchObject([
        { url: "https://a.example", title: "Aye", sortOrder: 0 },
        { url: "mailto:team@example.com", title: null, sortOrder: 1 },
      ]);
      expect(reordered).toEqual([
        { ...saved[1], sortOrder: 0 },
        { ...saved[0], sortOrder: 1 },
      ]);
      expect(invalid).toMatchObject({
        _tag: "RuleViolation",
        message: "A link must be a full http, https or mailto address.",
      });
      expect(missing).toMatchObject({ _tag: "NotFound", entity: "Item" });
      expect(yield* client.LoadItemLinks({ itemId })).toEqual(reordered);
    }),
  ),
);

const repeatFields = (title: string) => ({
  title,
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: "2026-11-10",
  dueTime: null,
  scheduledStart: null,
  scheduledEnd: null,
});

it.effect("Saves a repeat rule and completes from the server zone's local day", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const item = yield* create("Water plants");
      const recurrence = {
        frequency: "Daily",
        interval: 1,
        weekdays: null,
        monthDay: null,
        month: null,
        anchor: "CompletionDate",
        endKind: "OnDate",
        endDate: "2026-12-31",
        remaining: null,
      } as const;
      yield* client.EditItem({ itemId: item.id, fields: repeatFields(item.title), recurrence });
      // 03:00 UTC is still 13 November in New York (§5.4).
      yield* TestClock.setTime(Temporal.Instant.from("2026-11-14T03:00:00Z").epochMilliseconds);

      const result = yield* client.SetItemCompleted({ ...area, itemId: item.id, completed: true });

      expect(result).toMatchObject({ kind: "applied" });
      expect(result).not.toHaveProperty("lastRepeat");
      const { items } = yield* client.LoadArea(area);
      expect(items.open.map(({ item: row }) => [row.dueDate, row.recurrence])).toEqual([
        ["2026-11-14", recurrence],
      ]);
      expect(items.open[0]!.item.recurrenceSeriesId).toBe(
        items.finished[0]!.item.recurrenceSeriesId,
      );
    }),
  ),
);

it.effect("Skips, reports the last repeat and stops repeating through the renderer client", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const item = yield* create("Report");
      const recurrence = {
        frequency: "Weekly",
        interval: 1,
        weekdays: 2,
        monthDay: null,
        month: null,
        anchor: "DueDate",
        endKind: "AfterCount",
        endDate: null,
        remaining: 2,
      } as const;
      yield* client.EditItem({ itemId: item.id, fields: repeatFields(item.title), recurrence });

      const skipped = yield* client.SkipRepeat({ itemId: item.id });
      const exhausted = yield* client.SkipRepeat({ itemId: item.id });
      const completion = yield* client.SetItemCompleted({
        ...area,
        itemId: item.id,
        completed: true,
      });
      yield* client.StopRepeating({ itemId: item.id });

      expect([skipped, exhausted]).toEqual([true, false]);
      expect(completion).toMatchObject({ kind: "applied", lastRepeat: true });
      const { items } = yield* client.LoadArea(area);
      expect(items.finished.map(({ item: row }) => [row.dueDate, row.recurrence])).toEqual([
        ["2026-11-17", null],
      ]);
      expect(items.open).toEqual([]);
    }),
  ),
);

it.effect("Pushes back one day and refuses an undated item through the renderer client", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, create } = yield* setup;
      const dated = yield* create("Report");
      const undated = yield* create("Someday");
      const fields = { ...repeatFields(dated.title), scheduledStart: "2026-11-10T09:00:00" };
      yield* client.EditItem({ itemId: dated.id, fields });

      yield* client.PushBackOneDay({ itemId: dated.id.toLowerCase() });
      const failure = yield* Effect.flip(client.PushBackOneDay({ itemId: undated.id }));

      const { items } = yield* client.LoadArea(area);
      expect(items.open[0]!.item).toMatchObject({
        dueDate: "2026-11-11",
        scheduledStart: "2026-11-11T09:00:00",
      });
      expect(failure).toMatchObject({
        _tag: "RuleViolation",
        message: "This item has no due date or scheduled block.",
      });
      expect(yield* client.GetHistory()).toMatchObject({ undo: "Push back 'Report'" });
    }),
  ),
);

it.effect("Rejects an invalid repeat rule with a rule violation", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, create } = yield* setup;
      const item = yield* create("Report");
      const recurrence = {
        frequency: "Monthly",
        interval: 1,
        weekdays: null,
        monthDay: 32,
        month: null,
        anchor: "DueDate",
        endKind: "Never",
        endDate: null,
        remaining: null,
      } as const;

      const failure = yield* Effect.flip(
        client.EditItem({ itemId: item.id, fields: repeatFields(item.title), recurrence }),
      );

      expect(failure).toMatchObject({
        _tag: "RuleViolation",
        message: "Choose a valid day for the repeat frequency.",
      });
    }),
  ),
);
