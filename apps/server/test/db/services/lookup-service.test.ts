import { expect, it } from "@effect/vitest";
import { builtInItemTypes } from "@task-tracker/core";
import { Effect } from "effect";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { itemId, readItems, seedItem, withSchema } from "./fixtures.js";

it.effect("Added, renamed and reordered lookups persist", () =>
  Effect.gen(function* () {
    const lookups = yield* LookupService;
    const type = yield* lookups.itemTypes.add("Custom");
    const priority = yield* lookups.priorityLevels.add("Later");
    const types = yield* lookups.itemTypes.list();
    const levels = yield* lookups.priorityLevels.list();

    yield* lookups.itemTypes.rename(type.id, "Renamed");
    yield* lookups.priorityLevels.rename(priority.id, "Someday");
    yield* lookups.itemTypes.reorder([
      type.id,
      ...types.filter((row) => row.id !== type.id).map((row) => row.id),
    ]);
    yield* lookups.priorityLevels.reorder([
      priority.id,
      ...levels.filter((row) => row.id !== priority.id).map((row) => row.id),
    ]);

    expect((yield* lookups.itemTypes.list())[0]).toMatchObject({
      id: type.id,
      name: "Renamed",
      sortOrder: 0,
    });
    expect((yield* lookups.priorityLevels.list())[0]).toMatchObject({
      id: priority.id,
      name: "Someday",
      sortOrder: 0,
    });
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Archived lookups stay on items and built-in types cannot be archived", () =>
  Effect.gen(function* () {
    const lookups = yield* LookupService;
    const projects = yield* ProjectService;
    const project = yield* projects.create("Project");
    const type = yield* lookups.itemTypes.add("Custom");
    const priority = yield* lookups.priorityLevels.add("Later");
    yield* seedItem(project.id, { Id: itemId, ItemTypeId: type.id, PriorityLevelId: priority.id });

    const builtInError = yield* Effect.flip(lookups.itemTypes.archive(builtInItemTypes[0].id));
    yield* lookups.itemTypes.archive(type.id);
    yield* lookups.priorityLevels.archive(priority.id);
    const items = yield* readItems();
    const types = yield* lookups.itemTypes.list();
    const levels = yield* lookups.priorityLevels.list();

    expect(builtInError.message).toBe("Built-in item types cannot be archived.");
    expect(items).toMatchObject([{ ItemTypeId: type.id, PriorityLevelId: priority.id }]);
    expect(types).toContainEqual({ ...type, isArchived: true });
    expect(levels).toContainEqual({ ...priority, isArchived: true });
  }).pipe(
    Effect.provide(LookupService.layer),
    Effect.provide(ProjectService.layer("UTC")),
    withSchema,
  ),
);

it.effect("Adding or renaming to an existing lookup name is rejected ignoring case", () =>
  Effect.gen(function* () {
    const { itemTypes } = yield* LookupService;
    const custom = yield* itemTypes.add("Custom");

    const added = yield* Effect.flip(itemTypes.add(" custom "));
    const renamed = yield* Effect.flip(itemTypes.rename(custom.id, "Change"));

    expect(added.message).toBe("The name 'custom' is already used by another item type.");
    expect(renamed.message).toBe("The name 'Change' is already used by another item type.");
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Renaming a lookup to its own name is allowed", () =>
  Effect.gen(function* () {
    const { priorityLevels } = yield* LookupService;
    const level = yield* priorityLevels.add("Later");

    yield* priorityLevels.rename(level.id, "later");
    const levels = yield* priorityLevels.list();

    expect(levels).toContainEqual({ ...level, name: "later" });
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);

it.effect("Restoring archived lookups preserves their identity and order", () =>
  Effect.gen(function* () {
    const { itemTypes, priorityLevels } = yield* LookupService;
    const type = yield* itemTypes.add("Custom");
    const priority = yield* priorityLevels.add("Later");
    yield* itemTypes.archive(type.id);
    yield* priorityLevels.archive(priority.id);

    yield* itemTypes.restore(type.id);
    yield* priorityLevels.restore(priority.id);

    expect(yield* itemTypes.list()).toContainEqual(type);
    expect(yield* priorityLevels.list()).toContainEqual(priority);
  }).pipe(Effect.provide(LookupService.layer), withSchema),
);
