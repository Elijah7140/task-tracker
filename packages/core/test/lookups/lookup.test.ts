import { expect, it } from "@effect/vitest";
import {
  activeLookups,
  archiveLookup,
  builtInPriorityLevels,
  comparePriority,
  createPriorityLevel,
  renameLookup,
  reorderLookups,
  restoreLookup,
  restorePriorityLevel,
  setPriorityNumber,
} from "../../src/index.js";

it("allows archiving built-in priorities", () => {
  const [critical] = builtInPriorityLevels;

  const archived = archiveLookup(critical);

  expect(archived.isArchived).toBe(true);
});

it("adds, renames, and reorders priority levels", () => {
  const level = createPriorityLevel("later", "Later", builtInPriorityLevels);
  const renamedLevel = renameLookup(level, "Someday", builtInPriorityLevels);

  const levels = reorderLookups(
    [...builtInPriorityLevels, renamedLevel],
    [level.id, ...builtInPriorityLevels.map((row) => row.id)],
  );

  expect(levels[0]).toMatchObject({ id: level.id, name: "Someday", sortOrder: 0 });
  expect(level.sortOrder).toBe(4);
});

it("keeps the archived lookup identity while hiding it in pickers", () => {
  const level = createPriorityLevel("later", "Later", builtInPriorityLevels);

  const archivedLevel = archiveLookup(level);

  expect(archivedLevel).toMatchObject({ id: level.id, isArchived: true });
  expect(activeLookups([archivedLevel, ...builtInPriorityLevels])).toEqual(builtInPriorityLevels);
  expect(restoreLookup(archivedLevel)).toEqual(level);
});

it("reserves lookup names across active and archived rows, ignoring case", () => {
  const custom = createPriorityLevel("custom", "Custom", builtInPriorityLevels);
  const rows = [...builtInPriorityLevels, archiveLookup(custom)];

  expect(() => createPriorityLevel("second", " custom ", rows)).toThrow(
    "The name 'custom' is used by an archived priority level. Restore it instead.",
  );
  expect(() => renameLookup(custom, "High", rows)).toThrow(
    "The name 'High' is already used by another priority level.",
  );
});

it("allows renaming a lookup to its own name with different casing", () => {
  const level = createPriorityLevel("later", "Later", builtInPriorityLevels);

  const renamed = renameLookup(level, " later ", [...builtInPriorityLevels, level]);

  expect(renamed.name).toBe("later");
});

it("uses ordinal case matching for Greek iota and keeps multi-letter expansions distinct", () => {
  const greek = createPriorityLevel("greek", "ᾀ", []);
  const german = createPriorityLevel("german", "Straße", [greek]);

  expect(() => createPriorityLevel("duplicate", "ᾈ", [greek, german])).toThrow("already used");
  expect(createPriorityLevel("other", "Strasse", [greek, german]).name).toBe("Strasse");
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
  const [critical, high, medium] = builtInPriorityLevels;
  const levels = builtInPriorityLevels.slice(0, 3);

  expect(() => reorderLookups(levels, [critical.id, high.id])).toThrow("exactly once");
  expect(() => reorderLookups(levels, [critical.id, high.id, high.id])).toThrow("exactly once");
  expect(() => reorderLookups(levels, [critical.id, "unknown", medium.id])).toThrow("exactly once");
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
