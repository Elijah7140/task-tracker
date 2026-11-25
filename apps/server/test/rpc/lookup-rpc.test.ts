import { expect, it } from "@effect/vitest";
import { builtInPriorityLevels } from "@task-tracker/core";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const blankFields = {
  description: null,
  ticketNumber: null,
  dueDate: null,
  dueTime: null,
};

it.effect("Lists the seeded priorities and persists added, renamed and reordered ones", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const seededLevels = yield* client.ListPriorityLevels();

      const level = yield* client.AddPriorityLevel({ name: " Later " });
      yield* client.RenamePriorityLevel({ id: level.id.toLowerCase(), name: "Someday" });
      yield* client.ReorderPriorityLevels({
        ids: [level.id, ...seededLevels.map(({ id }) => id.toLowerCase())],
      });
      const levels = yield* client.ListPriorityLevels();

      expect(seededLevels.map(({ id }) => id)).toEqual(builtInPriorityLevels.map(({ id }) => id));
      expect(level).toMatchObject({ name: "Later", isBuiltIn: false, isArchived: false });
      expect(level).not.toHaveProperty("iconKey");
      expect(levels[0]).toEqual({ ...level, name: "Someday", label: "Someday", sortOrder: 0 });
      expect(levels.map(({ id }) => id)).toEqual([level.id, ...seededLevels.map(({ id }) => id)]);
    }),
  ),
);

it.effect("Keeps archived priority references on items and restores them with their identity", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Project" });
      const area = { projectId: project.id, folderId: null };
      const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Task" });
      const level = yield* client.AddPriorityLevel({ name: "Later" });
      yield* client.EditItem({
        itemId: item.id,
        fields: { ...blankFields, title: "Task", priorityLevelId: level.id },
      });

      yield* client.ArchivePriorityLevel({ id: level.id.toLowerCase() });
      const archived = yield* client.LoadArea(area);
      yield* client.RestorePriorityLevel({ id: level.id });
      const restored = yield* client.LoadArea(area);

      expect(archived.items.open[0]?.item).toMatchObject({ priorityLevelId: level.id });
      expect(archived).not.toHaveProperty("itemTypes");
      expect(archived.priorityLevels).toContainEqual({ ...level, isArchived: true });
      expect(restored.priorityLevels).toContainEqual(level);
    }),
  ),
);

it.effect("Returns lookup rule failures as rule violations and changes nothing", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const level = yield* client.AddPriorityLevel({ name: "Spike" });
      const unknown = "019A0000-0000-7000-8000-00000000FFFF";
      const before = yield* client.ListPriorityLevels();

      const duplicate = yield* Effect.flip(
        client.RenamePriorityLevel({ id: level.id, name: "HIGH" }),
      );
      const missing = yield* Effect.flip(client.RenamePriorityLevel({ id: unknown, name: "X" }));
      const partialOrder = yield* Effect.flip(client.ReorderPriorityLevels({ ids: [level.id] }));
      const blank = yield* Effect.flip(client.AddPriorityLevel({ name: "  " }));
      const after = yield* client.ListPriorityLevels();

      expect(duplicate).toMatchObject({
        _tag: "RuleViolation",
        message: "The name 'HIGH' is already used by another priority level.",
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

it.effect("Adds, numbers and lists priority labels independently of rank", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const high = builtInPriorityLevels[1];

      const seven = yield* client.AddPriorityLevel({ name: "", number: 7 });
      yield* client.SetPriorityNumber({ id: high.id.toLowerCase(), number: 2 });
      const numbered = yield* client.ListPriorityLevels();
      const refused = yield* Effect.flip(client.SetPriorityNumber({ id: high.id, number: 7 }));
      const invalid = yield* Effect.flip(client.AddPriorityLevel({ name: "Half", number: 1.5 }));
      yield* client.SetPriorityNumber({ id: high.id, number: null });
      const cleared = yield* client.ListPriorityLevels();

      expect(seven).toMatchObject({ label: "7", name: "", number: 7, sortOrder: 4 });
      expect(numbered[1]).toMatchObject({ label: "2 · High", number: 2, sortOrder: 1 });
      expect(refused).toMatchObject({
        _tag: "RuleViolation",
        message: "Priority number 7 is already in use.",
      });
      expect(invalid).toMatchObject({
        _tag: "RuleViolation",
        message: "Priority number must be a whole number of at least 1.",
      });
      expect(cleared[1]).toMatchObject({ label: "High", number: null });
    }),
  ),
);

it.effect("Accepts priority numbers up to the legacy Int32 maximum and refuses larger ones", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const high = builtInPriorityLevels[1];
      const largest = 2_147_483_647;

      const added = yield* client.AddPriorityLevel({ name: "", number: largest });
      const tooLargeAdd = yield* Effect.flip(
        client.AddPriorityLevel({ name: "Overflow", number: largest + 1 }),
      );
      yield* client.SetPriorityNumber({ id: high.id, number: largest - 1 });
      const tooLargeSet = yield* Effect.flip(
        client.SetPriorityNumber({ id: high.id, number: largest + 1 }),
      );
      const levels = yield* client.ListPriorityLevels();

      expect(added).toMatchObject({ number: largest, label: "2147483647" });
      for (const refusal of [tooLargeAdd, tooLargeSet]) {
        expect(refusal).toMatchObject({
          _tag: "RuleViolation",
          message: "Priority number must be no greater than 2147483647.",
        });
      }
      expect(levels.find(({ id }) => id === high.id)?.number).toBe(largest - 1);
      expect(levels.some(({ name }) => name === "Overflow")).toBe(false);
    }),
  ),
);

it.effect("Manages workflow statuses and returns their rule failures as rule violations", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const seeded = yield* client.ListStatuses();
      const completed = seeded.find(({ kind }) => kind === "Done")!;

      const released = yield* client.AddStatus({ name: " Released ", kind: "Done" });
      yield* client.RenameStatus({ id: released.id.toLowerCase(), name: "Shipped" });
      yield* client.ReorderStatuses({ ids: [released.id, ...seeded.map(({ id }) => id)] });
      yield* client.ArchiveStatus({ id: completed.id });
      const lastDone = yield* Effect.flip(client.ArchiveStatus({ id: released.id }));
      yield* client.RestoreStatus({ id: completed.id });
      const duplicate = yield* Effect.flip(client.AddStatus({ name: "queued", kind: "Open" }));
      const statuses = yield* client.ListStatuses();

      expect(seeded.map(({ name, kind }) => `${name} · ${kind}`)).toEqual([
        "Queued · Open",
        "In progress · Open",
        "Testing · Open",
        "Completed · Done",
      ]);
      expect(released).toEqual({
        id: expect.stringMatching(/^[0-9A-F-]{36}$/),
        name: "Released",
        kind: "Done",
        isArchived: false,
        sortOrder: 4,
        isInProgress: false,
      });
      expect(statuses[0]).toEqual({ ...released, name: "Shipped", sortOrder: 0 });
      expect(statuses.find(({ id }) => id === completed.id)?.isArchived).toBe(false);
      expect(lastDone).toMatchObject({
        _tag: "RuleViolation",
        message: "At least one Done status must stay active.",
      });
      expect(duplicate).toMatchObject({
        _tag: "RuleViolation",
        message: "The name 'queued' is already used by another status.",
      });
    }),
  ),
);
