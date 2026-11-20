import { expect, it } from "@effect/vitest";
import {
  activeLookups,
  archiveLookup,
  builtInItemTypes,
  builtInPriorityLevels,
  comparePriority,
  createItemType,
  createPriorityLevel,
  renameLookup,
  reorderLookups,
  restoreLookup,
  restorePriorityLevel,
  setPriorityNumber,
} from "../../src/index.js";

it("allows archiving built-in priorities but protects built-in item types", () => {
  const [critical] = builtInPriorityLevels;
  const [change] = builtInItemTypes;

  const archived = archiveLookup(critical);

  expect(archived.isArchived).toBe(true);
  expect(() => archiveLookup(change)).toThrow("Built-in item types cannot be archived.");
});

it("adds, renames, and reorders both kinds of lookup", () => {
  const type = createItemType("custom", "Custom", builtInItemTypes);
  const level = createPriorityLevel("later", "Later", builtInPriorityLevels);
  const renamedType = renameLookup(type, "Renamed", builtInItemTypes);
  const renamedLevel = renameLookup(level, "Someday", builtInPriorityLevels);

  const types = reorderLookups(
    [...builtInItemTypes, renamedType],
    [type.id, ...builtInItemTypes.map((row) => row.id)],
  );
  const levels = reorderLookups(
    [...builtInPriorityLevels, renamedLevel],
    [level.id, ...builtInPriorityLevels.map((row) => row.id)],
  );

  expect(types[0]).toMatchObject({ id: type.id, name: "Renamed", sortOrder: 0 });
  expect(levels[0]).toMatchObject({ id: level.id, name: "Someday", sortOrder: 0 });
  expect(level.sortOrder).toBe(4);
  expect(type.sortOrder).toBe(3);
});

it("keeps the archived lookup identity while hiding it in pickers", () => {
  const type = createItemType("custom", "Custom", builtInItemTypes);
  const level = createPriorityLevel("later", "Later", builtInPriorityLevels);

  const archivedType = archiveLookup(type);
  const archivedLevel = archiveLookup(level);

  expect(archivedType).toMatchObject({ id: type.id, isArchived: true });
  expect(archivedLevel).toMatchObject({ id: level.id, isArchived: true });
  expect(activeLookups([archivedType, ...builtInItemTypes])).toEqual(builtInItemTypes);
  expect(activeLookups([archivedLevel, ...builtInPriorityLevels])).toEqual(builtInPriorityLevels);
  expect(restoreLookup(archivedType)).toEqual(type);
});

it("reserves lookup names across active and archived rows, ignoring case", () => {
  const custom = createItemType("custom", "Custom", builtInItemTypes);
  const rows = [...builtInItemTypes, archiveLookup(custom)];

  expect(() => createItemType("second", " custom ", rows)).toThrow(
    "The name 'custom' is used by an archived item type. Restore it instead.",
  );
  expect(() => renameLookup(custom, "Change", rows)).toThrow(
    "The name 'Change' is already used by another item type.",
  );
});

it("allows renaming a lookup to its own name with different casing", () => {
  const level = createPriorityLevel("later", "Later", builtInPriorityLevels);

  const renamed = renameLookup(level, " later ", [...builtInPriorityLevels, level]);

  expect(renamed.name).toBe("later");
});

it("uses ordinal case matching for Greek iota and keeps multi-letter expansions distinct", () => {
  const greek = createItemType("greek", "ᾀ", []);
  const german = createItemType("german", "Straße", [greek]);

  expect(() => createItemType("duplicate", "ᾈ", [greek, german])).toThrow("already used");
  expect(createItemType("other", "Strasse", [greek, german]).name).toBe("Strasse");
});

it("ranks priorities by their current order and sorts missing priorities last", () => {
  const [critical, high, medium, low] = builtInPriorityLevels;
  const levels = reorderLookups(builtInPriorityLevels, [low.id, high.id, medium.id, critical.id]);

  expect([critical, low, null].toSorted(comparePriority)).toEqual([critical, low, null]);
  expect(
    [...levels]
      .reverse()
      .toSorted(comparePriority)
      .map((row) => row.id),
  ).toEqual([low.id, high.id, medium.id, critical.id]);
});

it("rejects a reorder that omits, duplicates, or replaces a lookup", () => {
  const [change, error, discussion] = builtInItemTypes;

  expect(() => reorderLookups(builtInItemTypes, [change.id, error.id])).toThrow("exactly once");
  expect(() => reorderLookups(builtInItemTypes, [change.id, error.id, error.id])).toThrow(
    "exactly once",
  );
  expect(() => reorderLookups(builtInItemTypes, [change.id, "unknown", discussion.id])).toThrow(
    "exactly once",
  );
});

it("says to restore an archived lookup, or restore or rename it first when renaming", () => {
  const [, high] = builtInPriorityLevels;
  const rows = [...builtInPriorityLevels, archiveLookup(createPriorityLevel("later", "Later", []))];

  const create = () => createPriorityLevel("new", "LATER", rows);
  const rename = () => renameLookup(high, "later", rows);

  expect(create).toThrow(
    "The name 'LATER' is used by an archived priority level. Restore it instead.",
  );
  expect(rename).toThrow(
    "The name 'later' is used by an archived priority level. Restore or rename that one first.",
  );
});

it("keeps priority numbers unique among active levels and checks them on restore", () => {
  const [critical, high] = builtInPriorityLevels;
  const archived = archiveLookup(setPriorityNumber(critical, 7, builtInPriorityLevels));
  const rows = [archived, high];

  const reused = setPriorityNumber(high, 7, rows);
  const restore = () => restorePriorityLevel(archived, [archived, reused]);
  const duplicate = () => createPriorityLevel("new", "", [archived, reused], 7);

  expect(reused.number).toBe(7);
  expect(restore).toThrow("Priority number 7 is already in use.");
  expect(duplicate).toThrow("Priority number 7 is already in use.");
  expect(restorePriorityLevel(archived, rows)).toMatchObject({ isArchived: false, number: 7 });
});
