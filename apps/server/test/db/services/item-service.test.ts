import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { readItems, setAutoComplete, withSchema } from "./fixtures.js";

const now = Temporal.Instant.from("2026-11-13T12:00:00Z");
const edit = (title: string) => ({
  title,
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: null,
  dueTime: null,
  scheduledStart: null,
  scheduledEnd: null,
});

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(now.epochMilliseconds);
  const projects = yield* ProjectService;
  const folders = yield* FolderService;
  const lookups = yield* LookupService;
  const items = yield* ItemService;
  const { id } = yield* projects.create("Project");
  const root = (title: string) => items.create(id, null, null, title);
  const child = (parentId: string, title: string) => items.create(id, null, parentId, title);
  const snapshot = () => items.loadArea(id, null);
  const complete = (itemId: string, completed = true, approval?: readonly string[]) =>
    items.setCompleted(id, null, itemId, completed, approval);
  return { id, projects, folders, lookups, items, root, child, snapshot, complete };
});

const withServices = <A, E>(
  test: Effect.Effect<
    A,
    E,
    ProjectService | FolderService | LookupService | ItemService | SqlClient.SqlClient
  >,
) =>
  test.pipe(
    Effect.provide(ProjectService.layer("UTC")),
    Effect.provide(FolderService.layer),
    Effect.provide(LookupService.layer),
    Effect.provide(ItemService.layer("UTC")),
    withSchema,
  );

it.effect("The next operation reads committed item changes", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const item = yield* root("Original");

      yield* items.edit(item.id, edit("Updated"));
      const saved = yield* snapshot();

      expect(saved.items).toMatchObject([{ item: { title: "Updated" } }]);
    }),
  ),
);

it.effect("The area marks finished branches and attributes rolled-up urgency", () =>
  withServices(
    Effect.gen(function* () {
      const { root, child, items, complete, snapshot } = yield* setup;
      const openRoot = yield* root("Open root");
      const finishedRoot = yield* root("Finished root");
      const openChild = yield* child(openRoot.id, "Open child");
      const finishedChild = yield* child(openRoot.id, "Finished child");
      yield* items.edit(openChild.id, {
        ...edit("Open child"),
        dueDate: Temporal.PlainDate.from("2026-11-12"),
      });
      yield* complete(finishedChild.id);
      yield* complete(finishedRoot.id);

      const saved = yield* snapshot();

      expect(saved.items).toMatchObject([
        {
          item: { id: openRoot.id },
          isFinished: false,
          displayedUrgency: { value: "Overdue", sourceDescendantId: openChild.id },
          children: [
            { item: { id: openChild.id }, isFinished: false },
            { item: { id: finishedChild.id }, isFinished: true },
          ],
        },
        { item: { id: finishedRoot.id }, isFinished: true },
      ]);
    }),
  ),
);

it.effect("A rejected edit leaves the item unchanged after a later project rename", () =>
  withServices(
    Effect.gen(function* () {
      const { id, projects, root, items, snapshot } = yield* setup;
      const item = yield* root("Original item");

      const error = yield* Effect.flip(
        items.edit(item.id, {
          ...edit("Rejected item"),
          dueTime: Temporal.PlainTime.from("09:00"),
        }),
      );
      yield* projects.rename(id, "Renamed project");
      const saved = yield* snapshot();

      expect(error.message).toMatch(/due/i);
      expect(saved.items).toMatchObject([{ item: { title: "Original item" } }]);
      expect(yield* projects.list()).toMatchObject([{ project: { name: "Renamed project" } }]);
    }),
  ),
);

it.effect("Moving a root under another item keeps the root order contiguous after a create", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, items, snapshot } = yield* setup;
      const first = yield* root("A");
      const second = yield* root("B");
      const third = yield* root("C");

      yield* items.move(id, null, first.id, second.id);
      const fourth = yield* root("D");
      const saved = yield* snapshot();

      expect(saved.items.map(({ item }) => [item.id, item.sortOrder])).toEqual([
        [second.id, 0],
        [third.id, 1],
        [fourth.id, 2],
      ]);
    }),
  ),
);

it.effect("Indent and move reopen a completed destination parent", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, items, complete, snapshot } = yield* setup;
      const parent = yield* root("Completed");
      const open = yield* root("Open");
      yield* complete(parent.id);

      yield* items.indent(id, null, open.id);
      const indented = yield* snapshot();
      yield* items.outdent(id, null, open.id);
      yield* complete(parent.id);
      yield* items.move(id, null, open.id, parent.id);
      const moved = yield* snapshot();

      expect(indented.items[0]?.item.completedAtUtc).toBeNull();
      expect(moved.items[0]?.item.completedAtUtc).toBeNull();
    }),
  ),
);

it.effect("Completion previews and blocked reopen requests persist no changes", () =>
  withServices(
    Effect.gen(function* () {
      const { root, child, complete, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      const leaf = yield* child(parent.id, "Child");

      const preview = yield* complete(parent.id);
      const unchanged = yield* snapshot();
      yield* complete(leaf.id);
      const blocked = yield* complete(parent.id, false);
      const saved = yield* snapshot();

      expect(preview).toEqual({
        kind: "needs-confirmation",
        openSubItemCount: 1,
        openSubItemIds: [leaf.id],
      });
      expect(unchanged.items).toMatchObject([
        { item: { completedAtUtc: null }, children: [{ item: { completedAtUtc: null } }] },
      ]);
      expect(blocked).toEqual({
        kind: "blocked",
        reason: "Reopen a sub-item instead, or add a new one.",
      });
      expect(saved.items).toMatchObject([
        { item: { completedAtUtc: now }, children: [{ item: { completedAtUtc: now } }] },
      ]);
    }),
  ),
);

it.effect("Completing the last child persists completion on its parent", () =>
  withServices(
    Effect.gen(function* () {
      const { root, child, complete, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      const leaf = yield* child(parent.id, "Child");

      yield* complete(leaf.id);
      const saved = yield* snapshot();

      expect(saved.items[0]?.item.completedAtUtc?.toString()).toBe(now.toString());
    }),
  ),
);

it.effect("Moving a root to another area carries deleted descendants for later restore", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, folders, items, snapshot } = yield* setup;
      const area = yield* folders.create(id, null, "Area");
      const parent = yield* root("Parent");
      const leaf = yield* child(parent.id, "Child");
      const batch = yield* items.delete(id, null, leaf.id);

      yield* items.moveToArea(id, null, area.id, parent.id);
      yield* items.restore(id, area.id, batch);
      const restored = yield* items.loadArea(id, area.id);

      expect(yield* snapshot()).toMatchObject({ items: [] });
      expect(restored.items).toMatchObject([
        {
          item: { id: parent.id, folderId: area.id },
          children: [
            { item: { id: leaf.id, folderId: area.id, deletedAtUtc: null, deletionBatchId: null } },
          ],
        },
      ]);
    }),
  ),
);

it.effect("Editing built-in fields round-trips floating values and UTC timestamps", () =>
  withServices(
    Effect.gen(function* () {
      const { root, lookups, items, snapshot } = yield* setup;
      const item = yield* root("Original");
      const type = yield* lookups.itemTypes.add("Custom");
      const priority = yield* lookups.priorityLevels.add("Later");
      const fields = {
        title: "Edited",
        description: "Description",
        ticketNumber: "T-7",
        itemTypeId: type.id,
        priorityLevelId: priority.id,
        dueDate: Temporal.PlainDate.from("2026-11-14"),
        dueTime: Temporal.PlainTime.from("17:45:00.1234567"),
        scheduledStart: Temporal.PlainDateTime.from("2026-11-14T09:30:00.1234567"),
        scheduledEnd: Temporal.PlainDateTime.from("2026-11-14T10:30:00.1234567"),
      };
      yield* TestClock.adjust("1 second");

      yield* items.edit(item.id, { ...fields, itemTypeId: type.id.toLowerCase() });
      const saved = yield* snapshot();

      expect(saved.items).toMatchObject([
        {
          item: {
            ...fields,
            createdAtUtc: now,
            updatedAtUtc: now.add({ seconds: 1 }),
          },
        },
      ]);
      const stored = saved.items[0]?.item;
      expect(stored?.dueDate?.toString()).toBe("2026-11-14");
      expect(stored?.dueTime?.toString()).toBe("17:45:00.1234567");
      expect(stored?.scheduledStart?.toString()).toBe("2026-11-14T09:30:00.1234567");
      expect(stored?.scheduledEnd?.toString()).toBe("2026-11-14T10:30:00.1234567");
      expect(stored?.createdAtUtc.toString()).toBe("2026-11-13T12:00:00Z");
      expect(stored?.updatedAtUtc.toString()).toBe("2026-11-13T12:00:01Z");
    }),
  ),
);

it.effect("Confirmed completion and reopening cascade across three levels", () =>
  withServices(
    Effect.gen(function* () {
      const { root, child, complete, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      const middle = yield* child(parent.id, "Child");
      const leaf = yield* child(middle.id, "Grandchild");

      const preview = yield* complete(parent.id);
      const beforeApproval = yield* snapshot();
      expect(preview.kind).toBe("needs-confirmation");
      if (preview.kind !== "needs-confirmation") return;
      yield* complete(parent.id, true, preview.openSubItemIds);
      const finished = yield* snapshot();
      const blocked = yield* complete(parent.id, false);
      yield* complete(leaf.id, false);
      const reopened = yield* snapshot();

      expect(beforeApproval.items[0]?.isFinished).toBe(false);
      expect(finished.items[0]?.isFinished).toBe(true);
      expect(finished.items[0]?.item.completedAtUtc?.toString()).toBe(now.toString());
      expect(blocked.kind).toBe("blocked");
      expect(reopened.items).toMatchObject([
        {
          item: { completedAtUtc: null },
          children: [
            { item: { completedAtUtc: null }, children: [{ item: { completedAtUtc: null } }] },
          ],
        },
      ]);
    }),
  ),
);

it.effect("Deleting and restoring an open child reconciles the parent", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, complete, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      const done = yield* child(parent.id, "Complete");
      const open = yield* child(parent.id, "Open");
      yield* complete(done.id);

      const batch = yield* items.delete(id, null, open.id);
      const deleted = yield* snapshot();
      yield* items.restore(id, null, batch);
      const restored = yield* snapshot();

      expect(deleted.items[0]?.item.completedAtUtc?.toString()).toBe(now.toString());
      expect(restored.items[0]?.item.completedAtUtc).toBeNull();
    }),
  ),
);

it.effect("An area includes active children, lookups, settings and descendant urgency", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      const leaf = yield* child(parent.id, "Child");
      const deleted = yield* child(parent.id, "Deleted");
      yield* items.delete(id, null, deleted.id);
      yield* items.edit(leaf.id, {
        ...edit("Child"),
        dueDate: Temporal.PlainDate.from("2026-11-12"),
      });

      const saved = yield* snapshot();

      expect(saved.items).toMatchObject([
        {
          item: { id: parent.id },
          displayedUrgency: { value: "Overdue", sourceDescendantId: leaf.id },
          children: [{ item: { id: leaf.id } }],
        },
      ]);
      expect(saved.itemTypes).toHaveLength(3);
      expect(saved.priorityLevels).toHaveLength(4);
      expect(saved.settings.autoCompleteParents.value).toBe(true);
    }),
  ),
);

it.effect("Move, indent, outdent and reorder persist parent and order", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, items, snapshot } = yield* setup;
      const first = yield* root("First");
      const second = yield* root("Second");
      const third = yield* root("Third");

      yield* items.indent(id, null, second.id);
      const indented = yield* snapshot();
      yield* items.outdent(id, null, second.id);
      yield* items.move(id, null, third.id, first.id);
      yield* items.reorder(id, null, null, [second.id, first.id]);
      const saved = yield* snapshot();

      expect(indented.items[0]?.children[0]?.item.parentItemId).toBe(first.id);
      expect(saved.items).toMatchObject([
        { item: { id: second.id, parentItemId: null, sortOrder: 0 } },
        {
          item: { id: first.id, sortOrder: 1 },
          children: [{ item: { id: third.id, parentItemId: first.id } }],
        },
      ]);
    }),
  ),
);

it.effect(
  "A confirmation for replaced open work returns a fresh preview even at the same count",
  () =>
    withServices(
      Effect.gen(function* () {
        const { id, root, child, items, complete, snapshot } = yield* setup;
        const parent = yield* root("Parent");
        const original = yield* child(parent.id, "Original");
        const preview = yield* complete(parent.id);
        expect(preview.kind).toBe("needs-confirmation");
        if (preview.kind !== "needs-confirmation") return;
        yield* items.delete(id, null, original.id);
        const replacement = yield* child(parent.id, "Replacement");

        const result = yield* complete(parent.id, true, preview.openSubItemIds);
        const saved = yield* snapshot();

        expect(result).toEqual({
          kind: "needs-confirmation",
          openSubItemCount: 1,
          openSubItemIds: [replacement.id],
        });
        expect(saved.items).toMatchObject([
          { item: { completedAtUtc: null }, children: [{ item: { completedAtUtc: null } }] },
        ]);
      }),
    ),
);

it.effect("A failed completion write rolls back all completion timestamps", () =>
  withServices(
    Effect.gen(function* () {
      const { root, child, complete, snapshot } = yield* setup;
      const sql = yield* SqlClient.SqlClient;
      const parent = yield* root("Parent");
      yield* child(parent.id, "Child");
      yield* sql`CREATE TRIGGER reject_second_completion BEFORE UPDATE OF CompletedAtUtc ON TodoItem
      WHEN NEW.CompletedAtUtc IS NOT NULL AND EXISTS (SELECT 1 FROM TodoItem WHERE CompletedAtUtc IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'second completion failed'); END`;

      const preview = yield* complete(parent.id);
      expect(preview.kind).toBe("needs-confirmation");
      if (preview.kind !== "needs-confirmation") return;
      const error = yield* Effect.flip(complete(parent.id, true, preview.openSubItemIds));
      const saved = yield* snapshot();

      expect(error.message).toContain("second completion failed");
      expect(saved.items).toMatchObject([
        { item: { completedAtUtc: null }, children: [{ item: { completedAtUtc: null } }] },
      ]);
    }),
  ),
);

it.effect("A failed ancestor completion rolls back the deletion and sibling order", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, complete, snapshot } = yield* setup;
      const sql = yield* SqlClient.SqlClient;
      const parent = yield* root("Parent");
      const open = yield* child(parent.id, "Open");
      const done = yield* child(parent.id, "Done");
      yield* complete(done.id);
      yield* sql`CREATE TRIGGER reject_parent_completion BEFORE UPDATE OF CompletedAtUtc ON TodoItem
      WHEN OLD.CompletedAtUtc IS NULL AND NEW.CompletedAtUtc IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'parent completion failed'); END`;

      const error = yield* Effect.flip(items.delete(id, null, open.id));
      const saved = yield* snapshot();
      const rows = yield* readItems();

      expect(error.message).toContain("parent completion failed");
      expect(saved.items).toMatchObject([
        {
          item: { completedAtUtc: null },
          children: [
            { item: { id: open.id, sortOrder: 0 } },
            { item: { id: done.id, sortOrder: 1 } },
          ],
        },
      ]);
      expect(rows.find((row) => row.Id === open.id)).toMatchObject({
        DeletedAtUtc: null,
        DeletionBatchId: null,
      });
    }),
  ),
);

it.effect(
  "An earlier deletion batch is preserved and cannot restore through a deleted parent",
  () =>
    withServices(
      Effect.gen(function* () {
        const { id, root, child, items, snapshot } = yield* setup;
        const parent = yield* root("Parent");
        const previous = yield* child(parent.id, "Previous");
        const current = yield* child(parent.id, "Current");
        const previousBatch = yield* items.delete(id, null, previous.id);

        const parentBatch = yield* items.delete(id, null, parent.id);
        const blocked = yield* Effect.flip(items.restore(id, null, previousBatch));
        const rows = yield* readItems();
        yield* items.restore(id, null, parentBatch);
        const saved = yield* snapshot();

        expect(blocked.message).toContain("Restore the parent");
        expect(rows.find((row) => row.Id === previous.id)).toMatchObject({
          DeletionBatchId: previousBatch,
        });
        expect(rows.find((row) => row.Id === current.id)).toMatchObject({
          DeletionBatchId: parentBatch,
        });
        expect(saved.items).toMatchObject([{ children: [{ item: { id: current.id } }] }]);
      }),
    ),
);

it.effect(
  "With automatic completion off, a completed parent stays unfinished while its child is open",
  () =>
    withServices(
      Effect.gen(function* () {
        const { root, child, complete, snapshot } = yield* setup;
        yield* setAutoComplete(false);
        const parent = yield* root("Parent");
        const leaf = yield* child(parent.id, "Child");

        const result = yield* complete(parent.id);
        const saved = yield* snapshot();

        expect(result.kind).toBe("applied");
        expect(saved.items).toMatchObject([
          {
            item: { completedAtUtc: now },
            isFinished: false,
            children: [{ item: { id: leaf.id, completedAtUtc: null } }],
          },
        ]);
      }),
    ),
);

it.effect("A failed descendant relocation rolls back the move and both sibling orders", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, folders, items, snapshot } = yield* setup;
      const sql = yield* SqlClient.SqlClient;
      const area = yield* folders.create(id, null, "Destination");
      const parent = yield* root("Parent");
      const leaf = yield* child(parent.id, "Child");
      const remaining = yield* root("Remaining");
      const destinationRoot = yield* items.create(id, area.id, null, "Destination root");
      const deleted = yield* items.delete(id, null, leaf.id);
      yield* sql`CREATE TRIGGER reject_deleted_descendant_move BEFORE UPDATE OF FolderId ON TodoItem
        WHEN OLD.DeletedAtUtc IS NOT NULL AND NEW.FolderId IS NOT OLD.FolderId
        BEGIN SELECT RAISE(ABORT, 'descendant move failed'); END`;

      const error = yield* Effect.flip(items.moveToArea(id, null, area.id, parent.id));
      const source = yield* snapshot();
      const destination = yield* items.loadArea(id, area.id);
      const rows = yield* readItems();

      expect(error.message).toContain("descendant move failed");
      expect(source.items).toMatchObject([
        { item: { id: parent.id, folderId: null, sortOrder: 0 } },
        { item: { id: remaining.id, folderId: null, sortOrder: 1 } },
      ]);
      expect(destination.items).toMatchObject([{ item: { id: destinationRoot.id, sortOrder: 0 } }]);
      expect(rows.find((row) => row.Id === leaf.id)).toMatchObject({
        FolderId: null,
        DeletionBatchId: deleted,
      });
    }),
  ),
);

it.effect("Reparenting the last open child reconciles both sides of a shared ancestor", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, complete, snapshot } = yield* setup;
      const ancestor = yield* root("Ancestor");
      const source = yield* child(ancestor.id, "Source");
      const open = yield* child(source.id, "Open");
      const done = yield* child(source.id, "Done");
      const destination = yield* child(ancestor.id, "Destination");
      yield* complete(done.id);
      yield* complete(destination.id);

      yield* items.move(id, null, open.id, destination.id);
      const saved = yield* snapshot();

      expect(saved.items).toMatchObject([
        {
          item: { id: ancestor.id, completedAtUtc: null },
          children: [
            { item: { id: source.id }, isFinished: true },
            {
              item: { id: destination.id, completedAtUtc: null },
              children: [{ item: { id: open.id, completedAtUtc: null } }],
            },
          ],
        },
      ]);
      expect(saved.items[0]?.children[0]?.item.completedAtUtc?.toString()).toBe(now.toString());
    }),
  ),
);

it.effect("Passing another item as edit fields updates only the requested item", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const target = yield* root("Target");
      const template = yield* root("Template");

      yield* items.edit(target.id, { ...template, title: "Copied" });
      const saved = yield* snapshot();

      expect(saved.items).toMatchObject([
        { item: { id: target.id, title: "Copied" } },
        { item: { id: template.id, title: "Template" } },
      ]);
    }),
  ),
);
