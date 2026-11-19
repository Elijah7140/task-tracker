import { expect, it } from "@effect/vitest";
import { MetadataRuleError } from "@task-tracker/core";
import { Deferred, Effect, Fiber } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FieldService } from "../../../src/services/field-service.js";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
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
    | ProjectService
    | FolderService
    | LookupService
    | ItemService
    | FieldService
    | UndoService
    | SqlClient.SqlClient
  >,
) =>
  test.pipe(
    Effect.provide(ProjectService.layer("UTC")),
    Effect.provide(FolderService.layer),
    Effect.provide(LookupService.layer),
    Effect.provide(ItemService.layer("UTC")),
    Effect.provide(FieldService.layer),
    withSchema,
  );

it.effect("The next operation reads committed item changes", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const item = yield* root("Original");

      yield* items.edit(item.id, edit("Updated"));
      const saved = yield* snapshot();

      expect(saved.items.open).toMatchObject([{ item: { title: "Updated" } }]);
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

      expect(saved.items).toMatchObject({
        open: [
          {
            item: { id: openRoot.id },
            isFinished: false,
            displayedUrgency: { value: "Overdue", sourceDescendantId: openChild.id },
            children: {
              open: [{ item: { id: openChild.id }, isFinished: false }],
              finished: [{ item: { id: finishedChild.id }, isFinished: true }],
            },
          },
        ],
        finished: [{ item: { id: finishedRoot.id }, isFinished: true }],
      });
    }),
  ),
);

const titles = (nodes: ReadonlyArray<{ readonly item: { readonly title: string } }>) =>
  nodes.map(({ item }) => item.title);

it.effect("Finished roots show newest completed first with ties in sibling order", () =>
  withServices(
    Effect.gen(function* () {
      const { root, complete, snapshot } = yield* setup;
      const first = yield* root("First");
      const second = yield* root("Second");
      yield* root("Third");
      const fourth = yield* root("Fourth");
      yield* complete(second.id);
      yield* TestClock.adjust("1 minute");
      yield* complete(fourth.id);
      yield* complete(first.id);

      const finished = yield* snapshot();
      yield* complete(fourth.id, false);
      const reopened = yield* snapshot();

      expect(titles(finished.items.open)).toEqual(["Third"]);
      expect(titles(finished.items.finished)).toEqual(["First", "Fourth", "Second"]);
      expect(titles(reopened.items.open)).toEqual(["Third", "Fourth"]);
      expect(titles(reopened.items.finished)).toEqual(["First", "Second"]);
    }),
  ),
);

it.effect("Finished sub-items show newest completed first with ties in sibling order", () =>
  withServices(
    Effect.gen(function* () {
      const { root, child, complete, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      const first = yield* child(parent.id, "First");
      const second = yield* child(parent.id, "Second");
      yield* child(parent.id, "Third");
      const fourth = yield* child(parent.id, "Fourth");
      yield* complete(fourth.id);
      yield* TestClock.adjust("1 minute");
      yield* complete(second.id);
      yield* complete(first.id);

      const finished = yield* snapshot();
      yield* complete(second.id, false);
      const reopened = yield* snapshot();

      const finishedChildren = finished.items.open[0]!.children;
      const reopenedChildren = reopened.items.open[0]!.children;
      expect(titles(finishedChildren.open)).toEqual(["Third"]);
      expect(titles(finishedChildren.finished)).toEqual(["First", "Second", "Fourth"]);
      expect(titles(reopenedChildren.open)).toEqual(["Second", "Third"]);
      expect(titles(reopenedChildren.finished)).toEqual(["First", "Fourth"]);
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
      expect(saved.items.open).toMatchObject([{ item: { title: "Original item" } }]);
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

      expect(saved.items.open.map(({ item }) => [item.id, item.sortOrder])).toEqual([
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

      expect(indented.items.open[0]?.item.completedAtUtc).toBeNull();
      expect(moved.items.open[0]?.item.completedAtUtc).toBeNull();
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
      expect(unchanged.items.open).toMatchObject([
        {
          item: { completedAtUtc: null },
          children: { open: [{ item: { completedAtUtc: null } }] },
        },
      ]);
      expect(blocked).toEqual({
        kind: "blocked",
        reason: "Reopen a sub-item instead, or add a new one.",
      });
      expect(saved.items.finished).toMatchObject([
        {
          item: { completedAtUtc: now },
          children: { finished: [{ item: { completedAtUtc: now } }] },
        },
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

      expect(saved.items.finished[0]?.item.completedAtUtc?.toString()).toBe(now.toString());
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

      expect((yield* snapshot()).items).toEqual({ open: [], finished: [] });
      expect(restored.items.open).toMatchObject([
        {
          item: { id: parent.id, folderId: area.id },
          children: {
            open: [
              {
                item: { id: leaf.id, folderId: area.id, deletedAtUtc: null, deletionBatchId: null },
              },
            ],
          },
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

      expect(saved.items.open).toMatchObject([
        {
          item: {
            ...fields,
            createdAtUtc: now,
            updatedAtUtc: now.add({ seconds: 1 }),
          },
        },
      ]);
      const stored = saved.items.open[0]?.item;
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

      expect(beforeApproval.items.open[0]?.isFinished).toBe(false);
      expect(finished.items.finished[0]?.isFinished).toBe(true);
      expect(finished.items.finished[0]?.item.completedAtUtc?.toString()).toBe(now.toString());
      expect(blocked.kind).toBe("blocked");
      expect(reopened.items.open).toMatchObject([
        {
          item: { completedAtUtc: null },
          children: {
            open: [
              {
                item: { completedAtUtc: null },
                children: { open: [{ item: { completedAtUtc: null } }] },
              },
            ],
          },
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

      expect(deleted.items.finished[0]?.item.completedAtUtc?.toString()).toBe(now.toString());
      expect(restored.items.open[0]?.item.completedAtUtc).toBeNull();
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

      expect(saved.items.open).toMatchObject([
        {
          item: { id: parent.id },
          displayedUrgency: { value: "Overdue", sourceDescendantId: leaf.id },
          children: { open: [{ item: { id: leaf.id } }] },
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

      expect(indented.items.open[0]?.children.open[0]?.item.parentItemId).toBe(first.id);
      expect(saved.items.open).toMatchObject([
        { item: { id: second.id, parentItemId: null, sortOrder: 0 } },
        {
          item: { id: first.id, sortOrder: 1 },
          children: { open: [{ item: { id: third.id, parentItemId: first.id } }] },
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
        expect(saved.items.open).toMatchObject([
          {
            item: { completedAtUtc: null },
            children: { open: [{ item: { completedAtUtc: null } }] },
          },
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
      expect(saved.items.open).toMatchObject([
        {
          item: { completedAtUtc: null },
          children: { open: [{ item: { completedAtUtc: null } }] },
        },
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
      expect(saved.items.open).toMatchObject([
        {
          item: { completedAtUtc: null },
          children: {
            open: [{ item: { id: open.id, sortOrder: 0 } }],
            finished: [{ item: { id: done.id, sortOrder: 1 } }],
          },
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
        expect(saved.items.open).toMatchObject([
          { children: { open: [{ item: { id: current.id } }] } },
        ]);
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
        expect(saved.items.open).toMatchObject([
          {
            item: { completedAtUtc: now },
            isFinished: false,
            children: { open: [{ item: { id: leaf.id, completedAtUtc: null } }] },
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
      expect(source.items.open).toMatchObject([
        { item: { id: parent.id, folderId: null, sortOrder: 0 } },
        { item: { id: remaining.id, folderId: null, sortOrder: 1 } },
      ]);
      expect(destination.items.open).toMatchObject([
        { item: { id: destinationRoot.id, sortOrder: 0 } },
      ]);
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

      yield* items.drop(id, null, open.id, destination.id, "into");
      const saved = yield* snapshot();

      expect(saved.items.open).toMatchObject([
        {
          item: { id: ancestor.id, completedAtUtc: null },
          children: {
            open: [
              {
                item: { id: destination.id, completedAtUtc: null },
                children: { open: [{ item: { id: open.id, completedAtUtc: null } }] },
              },
            ],
            finished: [{ item: { id: source.id }, isFinished: true }],
          },
        },
      ]);
      expect(saved.items.open[0]?.children.finished[0]?.item.completedAtUtc?.toString()).toBe(
        now.toString(),
      );
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

      expect(saved.items.open).toMatchObject([
        { item: { id: target.id, title: "Copied" } },
        { item: { id: template.id, title: "Template" } },
      ]);
    }),
  ),
);

it.effect("An invalid custom value leaves the built-in edit unsaved", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const fields = yield* FieldService;
      const number = yield* fields.create("Number", "Number", null);
      const item = yield* root("Original");

      const error = yield* Effect.flip(
        items.edit(item.id, edit("Changed"), [{ fieldDefinitionId: number.id, numberValue: NaN }]),
      );
      const saved = yield* snapshot();
      const values = yield* items.loadFieldValues(item.id);

      expect(error.message).toContain("finite");
      expect(saved.items.open).toMatchObject([{ item: { title: "Original" } }]);
      expect(values).toEqual([]);
    }),
  ),
);

it.effect("An unchanged archived choice keeps its value through an item edit", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const fields = yield* FieldService;
      const field = yield* fields.create("Status", "Choice", null);
      const choice = yield* fields.addChoice(field.id, "Ready");
      const item = yield* root("Original");
      yield* items.edit(item.id, edit("Original"), [
        { fieldDefinitionId: field.id, choiceId: choice.id },
      ]);
      yield* fields.archiveChoice(field.id, choice.id);

      yield* items.edit(item.id, edit("Changed"), [
        { fieldDefinitionId: field.id.toLowerCase(), choiceId: choice.id.toLowerCase() },
      ]);
      const values = yield* items.loadFieldValues(item.id.toLowerCase());
      const saved = yield* snapshot();

      expect(values).toMatchObject([{ choiceId: choice.id }]);
      expect(saved.items.open).toMatchObject([{ item: { title: "Changed" } }]);
    }),
  ),
);

it.effect("A project field cannot be written on another project's item", () =>
  withServices(
    Effect.gen(function* () {
      const { id, projects, root, items } = yield* setup;
      const fields = yield* FieldService;
      const other = yield* projects.create("Other");
      const field = yield* fields.create("Local", "Text", other.id);
      const item = yield* root("Item");

      const error = yield* Effect.flip(
        items.edit(item.id, edit("Item"), [{ fieldDefinitionId: field.id, textValue: "value" }]),
      );

      expect(error.message).toContain("does not belong");
      expect(yield* items.loadFieldValues(item.id)).toEqual([]);
      expect(yield* fields.listEffective(id)).toEqual([]);
    }),
  ),
);

it.effect("Soft-deleting an item retains its stored custom value", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, items } = yield* setup;
      const fields = yield* FieldService;
      const sql = yield* SqlClient.SqlClient;
      const field = yield* fields.create("Field", "Text", null);
      const item = yield* root("Item");
      yield* items.edit(item.id, edit("Item"), [
        { fieldDefinitionId: field.id, textValue: "value" },
      ]);

      yield* items.delete(id, null, item.id);
      const lookupError = yield* Effect.flip(items.loadFieldValues(item.id));
      const stored = yield* sql.withTransaction(
        sql`SELECT TextValue FROM ItemFieldValue WHERE ItemId = ${item.id}`.values,
      );

      expect(lookupError.message).toContain("missing or deleted");
      expect(stored).toEqual([["value"]]);
    }),
  ),
);

it.effect("A partial edit keeps omitted archived fields and clears blank and null values", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items } = yield* setup;
      const fields = yield* FieldService;
      const archived = yield* fields.create("Archived", "Text", null);
      const blank = yield* fields.create("Blank", "Text", null);
      const cleared = yield* fields.create("Cleared", "Number", null);
      const item = yield* root("Item");
      yield* items.edit(item.id, edit("Item"), [
        { fieldDefinitionId: archived.id, textValue: "keep" },
        { fieldDefinitionId: blank.id, textValue: " trim " },
        { fieldDefinitionId: cleared.id, numberValue: 42 },
      ]);
      yield* fields.archive(archived.id);

      yield* items.edit(item.id, edit("Changed"), [
        { fieldDefinitionId: blank.id, textValue: " " },
        { fieldDefinitionId: cleared.id, numberValue: null },
      ]);
      const values = yield* items.loadFieldValues(item.id);

      expect(values).toMatchObject([{ fieldDefinitionId: archived.id, textValue: "keep" }]);
    }),
  ),
);

it.effect("Every custom field data type saves and reloads", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items } = yield* setup;
      const fields = yield* FieldService;
      const text = yield* fields.create("Text", "Text", null);
      const number = yield* fields.create("Number", "Number", null);
      const date = yield* fields.create("Date", "Date", null);
      const boolean = yield* fields.create("Boolean", "Boolean", null);
      const choiceField = yield* fields.create("Choice", "Choice", null);
      const choice = yield* fields.addChoice(choiceField.id, "Ready");
      const item = yield* root("Item");

      yield* items.edit(item.id, edit("Item"), [
        { fieldDefinitionId: text.id, textValue: " trimmed " },
        { fieldDefinitionId: number.id, numberValue: 1.5 },
        { fieldDefinitionId: date.id, dateValue: Temporal.PlainDate.from("2026-11-13") },
        { fieldDefinitionId: boolean.id, boolValue: false },
        { fieldDefinitionId: choiceField.id, choiceId: choice.id },
      ]);
      const values = yield* items.loadFieldValues(item.id);
      const byField = new Map(values.map((value) => [value.fieldDefinitionId, value]));

      expect(values).toHaveLength(5);
      expect(byField.get(text.id)?.textValue).toBe("trimmed");
      expect(byField.get(number.id)?.numberValue).toBe(1.5);
      expect(byField.get(date.id)?.dateValue?.toString()).toBe("2026-11-13");
      expect(byField.get(boolean.id)?.boolValue).toBe(false);
      expect(byField.get(choiceField.id)?.choiceId).toBe(choice.id);
    }),
  ),
);

it.effect("Restore preserves custom values and deleted items still lock a field's type", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, items } = yield* setup;
      const fields = yield* FieldService;
      const field = yield* fields.create("Field", "Text", null);
      const item = yield* root("Item");
      yield* items.edit(item.id, edit("Item"), [
        { fieldDefinitionId: field.id, textValue: "value" },
      ]);
      const batch = yield* items.delete(id, null, item.id);

      const error = yield* Effect.flip(fields.changeType(field.id, "Date"));
      yield* items.restore(id, null, batch);
      const values = yield* items.loadFieldValues(item.id);

      expect(error.message).toContain("cannot change type");
      expect(values).toMatchObject([{ fieldDefinitionId: field.id, textValue: "value" }]);
      expect(yield* fields.listAll(null)).toEqual([field]);
    }),
  ),
);

it.effect("A rejected custom edit does not leak into the next successful operation", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const fields = yield* FieldService;
      const text = yield* fields.create("Text", "Text", null);
      const number = yield* fields.create("Number", "Number", null);
      const original = yield* root("Original");

      const error = yield* Effect.flip(
        items.edit(original.id, edit("Failed"), [
          { fieldDefinitionId: text.id, textValue: "valid" },
          { fieldDefinitionId: number.id, numberValue: NaN },
        ]),
      );
      yield* root("Later");
      const saved = yield* snapshot();

      expect(error).toBeInstanceOf(MetadataRuleError);
      expect(saved.items.open).toMatchObject([
        { item: { title: "Original" } },
        { item: { title: "Later" } },
      ]);
      expect(yield* items.loadFieldValues(original.id)).toEqual([]);
    }),
  ),
);

it.effect("An item value edit waits and validates against a concurrent definition change", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const fields = yield* FieldService;
      const sql = yield* SqlClient.SqlClient;
      const field = yield* fields.create("Field", "Text", null);
      const item = yield* root("Original");
      const release = yield* Deferred.make<void>();
      const holder = yield* sql
        .withTransaction(Deferred.await(release))
        .pipe(Effect.forkChild({ startImmediately: true }));

      const definition = yield* fields
        .changeType(field.id, "Number")
        .pipe(Effect.forkChild({ startImmediately: true }));
      const value = yield* items
        .edit(item.id, edit("Changed"), [{ fieldDefinitionId: field.id, textValue: "stale" }])
        .pipe(Effect.flip, Effect.forkChild({ startImmediately: true }));
      expect(definition.pollUnsafe()).toBeUndefined();
      expect(value.pollUnsafe()).toBeUndefined();
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(holder);
      yield* Fiber.join(definition);
      const error = yield* Fiber.join(value);
      const saved = yield* snapshot();

      expect(error.message).toContain("matching the field type");
      expect(saved.items.open).toMatchObject([{ item: { title: "Original" } }]);
      expect(yield* fields.listAll(null)).toEqual([{ ...field, dataType: "Number" }]);
      expect(yield* items.loadFieldValues(item.id)).toEqual([]);
    }),
  ),
);

it.effect("A failed SQL value write rolls back the title and all custom value changes", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, snapshot } = yield* setup;
      const fields = yield* FieldService;
      const sql = yield* SqlClient.SqlClient;
      const replaced = yield* fields.create("Replaced", "Text", null);
      const cleared = yield* fields.create("Cleared", "Number", null);
      const rejected = yield* fields.create("Rejected", "Text", null);
      const item = yield* root("Original");
      yield* items.edit(item.id, edit("Original"), [
        { fieldDefinitionId: replaced.id, textValue: "old" },
        { fieldDefinitionId: cleared.id, numberValue: 0 },
      ]);
      const originalValues = yield* items.loadFieldValues(item.id);
      yield* sql`CREATE TRIGGER reject_field_value BEFORE INSERT ON ItemFieldValue
        WHEN NEW.TextValue = 'reject'
        BEGIN SELECT RAISE(ABORT, 'value write failed'); END`;

      const error = yield* Effect.flip(
        items.edit(item.id, edit("Changed"), [
          { fieldDefinitionId: cleared.id, numberValue: null },
          { fieldDefinitionId: replaced.id, textValue: "new" },
          { fieldDefinitionId: rejected.id, textValue: "reject" },
        ]),
      );
      const saved = yield* snapshot();

      expect(error.message).toContain("value write failed");
      expect(saved.items.open).toMatchObject([{ item: { title: "Original" } }]);
      expect(yield* items.loadFieldValues(item.id)).toEqual(originalValues);
    }),
  ),
);

it.effect(
  "Setting a priority changes only the priority and clears the ticket rank in one step",
  () =>
    withServices(
      Effect.gen(function* () {
        const { root, items, lookups, snapshot } = yield* setup;
        const undo = yield* UndoService;
        const sql = yield* SqlClient.SqlClient;
        const item = yield* root("Task");
        yield* items.edit(item.id, { ...edit("Task"), description: "Notes", ticketNumber: "T-1" });
        yield* sql.withTransaction(sql`UPDATE TodoItem SET TicketRank = 3 WHERE Id = ${item.id}`);
        const level = yield* lookups.priorityLevels.add("", 7);
        const [before] = yield* readItems();

        yield* items.setPriority(item.id, level.id);
        const [after] = yield* readItems();
        const history = yield* undo.status();
        yield* undo.apply("undo");
        const undone = (yield* snapshot()).items.open[0]?.item;

        expect(after).toEqual({
          ...before,
          PriorityLevelId: level.id,
          TicketRank: null,
          UpdatedAtUtc: after?.UpdatedAtUtc,
        });
        expect(history.undo).toBe("Set priority of 'Task'");
        expect(undone?.priorityLevelId).toBeNull();
      }),
    ),
);

it.effect("Setting the current priority or an archived one saves nothing", () =>
  withServices(
    Effect.gen(function* () {
      const { root, items, lookups } = yield* setup;
      const undo = yield* UndoService;
      const item = yield* root("Task");
      const level = yield* lookups.priorityLevels.add("Later");
      yield* lookups.priorityLevels.archive(level.id);
      const before = yield* readItems();
      const history = yield* undo.status();

      yield* items.setPriority(item.id, null);
      const refusal = yield* Effect.flip(items.setPriority(item.id, level.id));

      expect(refusal.message).toBe("Priority is missing or archived.");
      expect(yield* readItems()).toEqual(before);
      expect(yield* undo.status()).toEqual(history);
    }),
  ),
);

it.effect("A drop promotes a child at the target and renumbers both sibling lists", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, snapshot } = yield* setup;
      const first = yield* root("First");
      const second = yield* root("Second");
      yield* root("Third");
      yield* child(first.id, "Child A");
      const source = yield* child(first.id, "Child B");
      yield* child(first.id, "Child C");
      yield* child(source.id, "Grandchild");

      yield* items.drop(id, null, source.id, second.id, "before");
      const { items: saved } = yield* snapshot();

      expect(saved.open.map(({ item }) => [item.title, item.parentItemId, item.sortOrder])).toEqual(
        [
          ["First", null, 0],
          ["Child B", null, 1],
          ["Second", null, 2],
          ["Third", null, 3],
        ],
      );
      expect(saved.open[0]?.children.open.map(({ item }) => [item.title, item.sortOrder])).toEqual([
        ["Child A", 0],
        ["Child C", 1],
      ]);
      expect(titles(saved.open[1]!.children.open)).toEqual(["Grandchild"]);
    }),
  ),
);

it.effect("Self and descendant drops leave nothing for the next successful move to save", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      const descendant = yield* child(parent.id, "Child");
      const other = yield* root("Other");

      for (const [target, position] of [
        [parent, "before"],
        [descendant, "into"],
        [descendant, "after"],
      ] as const) {
        const failure = yield* Effect.flip(items.drop(id, null, parent.id, target.id, position));
        expect(failure.message).toMatch(/cycle/i);
      }
      yield* items.drop(id, null, other.id, parent.id, "before");
      const { items: saved } = yield* snapshot();

      expect(titles(saved.open)).toEqual(["Other", "Parent"]);
      expect(titles(saved.open[1]!.children.open)).toEqual(["Child"]);
    }),
  ),
);

it.effect("Finished branches accept into drops but reject both insertion edges", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, snapshot, complete } = yield* setup;
      const open = yield* root("Open");
      const done = yield* root("Done");
      const older = yield* child(done.id, "Earlier child");
      const alsoDone = yield* root("Also done");
      yield* complete(older.id);
      yield* complete(alsoDone.id);

      for (const position of ["before", "after"] as const) {
        for (const [source, target] of [
          [done, open],
          [open, done],
          [done, alsoDone],
        ] as const) {
          const failure = yield* Effect.flip(items.drop(id, null, source.id, target.id, position));
          expect(failure.message).toMatch(/finished/i);
        }
      }
      yield* items.drop(id, null, open.id, done.id, "into");
      yield* items.drop(id, null, alsoDone.id, done.id, "into");
      const { items: saved } = yield* snapshot();

      expect(saved.open).toMatchObject([{ item: { title: "Done", completedAtUtc: null } }]);
      expect(titles(saved.open[0]!.children.open)).toEqual(["Open"]);
      expect(
        saved.open[0]?.children.finished.map(({ item }) => [item.title, item.sortOrder]),
      ).toEqual([
        ["Earlier child", 0],
        ["Also done", 2],
      ]);
    }),
  ),
);

it.effect("Outdent inserts immediately after the parent", () =>
  withServices(
    Effect.gen(function* () {
      const { id, root, child, items, snapshot } = yield* setup;
      const parent = yield* root("Parent");
      yield* root("Later");
      const source = yield* child(parent.id, "Child");

      yield* items.outdent(id, null, source.id);
      const { items: saved } = yield* snapshot();

      expect(titles(saved.open)).toEqual(["Parent", "Child", "Later"]);
    }),
  ),
);
