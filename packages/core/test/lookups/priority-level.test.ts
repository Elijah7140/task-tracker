import { expect, it } from "@effect/vitest";
import {
  createPriorityLevel,
  priorityLabel,
  renameLookup,
  setPriorityNumber,
} from "../../src/index.js";

it("Shows the number, the name, or both", () => {
  const numberOnly = createPriorityLevel("one", "  ", [], 7);
  const named = createPriorityLevel("two", " Hotfix ", [], 7);
  const nameOnly = createPriorityLevel("three", "Hotfix", []);

  expect([numberOnly, named, nameOnly].map(priorityLabel)).toEqual(["7", "7 · Hotfix", "Hotfix"]);
});

it.each([0, -1, 1.5])("Refuses an invalid priority number of %s", (number) => {
  const level = createPriorityLevel("one", "High", []);

  expect(() => setPriorityNumber(level, number, [level])).toThrow(
    "Priority number must be a whole number of at least 1.",
  );
  expect(level.number).toBeNull();
});

it("Requires a name before clearing the number of a number-only level", () => {
  const level = createPriorityLevel("one", "", [], 3);

  expect(() => setPriorityNumber(level, null, [level])).toThrow(
    "Name must be 1 to 300 characters.",
  );
  expect(level.number).toBe(3);
});

it("Keeps the number when renaming, including when clearing the name", () => {
  const level = createPriorityLevel("one", "High", [], 7);

  expect(priorityLabel(renameLookup(level, "Hotfix", [level]))).toBe("7 · Hotfix");
  expect(priorityLabel(renameLookup(level, "", [level]))).toBe("7");
});
