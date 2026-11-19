import { expect, it } from "@effect/vitest";
import { builtInItemTypes, builtInPriorityLevels } from "@task-tracker/core";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const blankFields = {
  description: null,
  ticketNumber: null,
  dueDate: null,
  dueTime: null,
  scheduledStart: null,
  scheduledEnd: null,
};

it.effect("Lists the seeded lookups and persists added, renamed and reordered ones", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const seededTypes = yield* client.ListItemTypes();
      const seededLevels = yield* client.ListPriorityLevels();

      const type = yield* client.AddItemType({ name: " Spike " });
      const level = yield* client.AddPriorityLevel({ name: "Later" });
      yield* client.RenameItemType({ id: type.id.toLowerCase(), name: "Research" });
      yield* client.RenamePriorityLevel({ id: level.id, name: "Someday" });
      yield* client.ReorderItemTypes({
        ids: [type.id, ...seededTypes.map(({ id }) => id.toLowerCase())],
      });
      yield* client.ReorderPriorityLevels({ ids: [level.id, ...seededLevels.map(({ id }) => id)] });
      const types = yield* client.ListItemTypes();
      const levels = yield* client.ListPriorityLevels();

      expect(seededTypes.map(({ id }) => id)).toEqual(builtInItemTypes.map(({ id }) => id));
      expect(seededLevels.map(({ id }) => id)).toEqual(builtInPriorityLevels.map(({ id }) => id));
      expect(type).toEqual({
        id: expect.stringMatching(/^[0-9A-F-]{36}$/),
        name: "Spike",
        colorKey: null,
        iconKey: null,
        isBuiltIn: false,
        isArchived: false,
        sortOrder: seededTypes.length,
      });
      expect(level).not.toHaveProperty("iconKey");
      expect(types[0]).toEqual({ ...type, name: "Research", sortOrder: 0 });
      expect(types.map(({ id }) => id)).toEqual([type.id, ...seededTypes.map(({ id }) => id)]);
      expect(levels[0]).toEqual({ ...level, name: "Someday", sortOrder: 0 });
    }),
  ),
);

it.effect("Keeps archived lookup references on items and restores them with their identity", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Project" });
      const area = { projectId: project.id, folderId: null };
      const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Task" });
      const type = yield* client.AddItemType({ name: "Spike" });
      const level = yield* client.AddPriorityLevel({ name: "Later" });
      yield* client.EditItem({
        itemId: item.id,
        fields: { ...blankFields, title: "Task", itemTypeId: type.id, priorityLevelId: level.id },
      });

      yield* client.ArchiveItemType({ id: type.id });
      yield* client.ArchivePriorityLevel({ id: level.id.toLowerCase() });
      const archived = yield* client.LoadArea(area);
      const archivedTypes = yield* client.ListItemTypes();
      yield* client.RestoreItemType({ id: type.id });
      yield* client.RestorePriorityLevel({ id: level.id });
      const restored = yield* client.LoadArea(area);

      expect(archived.items[0]?.item).toMatchObject({
        itemTypeId: type.id,
        priorityLevelId: level.id,
      });
      expect(archived.itemTypes).toContainEqual({ ...type, isArchived: true });
      expect(archived.priorityLevels).toContainEqual({ ...level, isArchived: true });
      expect(archivedTypes).toContainEqual({ ...type, isArchived: true });
      expect(restored.itemTypes).toContainEqual(type);
      expect(restored.priorityLevels).toContainEqual(level);
      expect(restored.items[0]?.item).toMatchObject({ itemTypeId: type.id });
    }),
  ),
);

it.effect("Returns lookup rule failures as rule violations and changes nothing", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const type = yield* client.AddItemType({ name: "Spike" });
      const builtIn = builtInItemTypes[0].id;
      const unknown = "019A0000-0000-7000-8000-00000000FFFF";
      const before = yield* client.ListItemTypes();

      const duplicate = yield* Effect.flip(client.RenameItemType({ id: type.id, name: "CHANGE" }));
      const builtInArchive = yield* Effect.flip(client.ArchiveItemType({ id: builtIn }));
      const missing = yield* Effect.flip(client.RenamePriorityLevel({ id: unknown, name: "X" }));
      const partialOrder = yield* Effect.flip(client.ReorderItemTypes({ ids: [type.id] }));
      const blank = yield* Effect.flip(client.AddPriorityLevel({ name: "  " }));
      const after = yield* client.ListItemTypes();

      expect(duplicate).toMatchObject({
        _tag: "RuleViolation",
        message: "The name 'CHANGE' is already used by another item type.",
      });
      expect(builtInArchive).toMatchObject({
        _tag: "RuleViolation",
        message: "Built-in item types cannot be archived.",
      });
      expect(missing).toMatchObject({ _tag: "RuleViolation", message: "Lookup was not found." });
      expect(partialOrder).toMatchObject({
        _tag: "RuleViolation",
        message: "Order must contain every lookup exactly once.",
      });
      expect(blank).toMatchObject({ _tag: "RuleViolation" });
      expect(after).toEqual(before);
    }),
  ),
);
