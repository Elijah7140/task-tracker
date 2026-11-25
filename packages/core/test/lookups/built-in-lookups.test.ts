import { expect, it } from "@effect/vitest";
import { builtInPriorityLevels } from "../../src/index.js";

it("matches the priority rows in the legacy initial migration", () => {
  expect(builtInPriorityLevels).toEqual([
    {
      id: "019A0000-0000-7000-8000-000000000101",
      name: "Critical",
      sortOrder: 0,
      colorKey: null,
      number: null,
      isBuiltIn: true,
      isArchived: false,
    },
    {
      id: "019A0000-0000-7000-8000-000000000102",
      name: "High",
      sortOrder: 1,
      colorKey: null,
      number: null,
      isBuiltIn: true,
      isArchived: false,
    },
    {
      id: "019A0000-0000-7000-8000-000000000103",
      name: "Medium",
      sortOrder: 2,
      colorKey: null,
      number: null,
      isBuiltIn: true,
      isArchived: false,
    },
    {
      id: "019A0000-0000-7000-8000-000000000104",
      name: "Low",
      sortOrder: 3,
      colorKey: null,
      number: null,
      isBuiltIn: true,
      isArchived: false,
    },
  ]);
});
