import { expect, it } from "@effect/vitest";
import { builtInItemTypes, builtInPriorityLevels } from "../../src/index.js";

it("matches the seven lookup rows in the legacy initial migration", () => {
  expect(builtInItemTypes).toEqual([
    {
      id: "019A0000-0000-7000-8000-000000000001",
      name: "Change",
      sortOrder: 0,
      colorKey: null,
      iconKey: null,
      isBuiltIn: true,
      isArchived: false,
    },
    {
      id: "019A0000-0000-7000-8000-000000000002",
      name: "Error",
      sortOrder: 1,
      colorKey: null,
      iconKey: null,
      isBuiltIn: true,
      isArchived: false,
    },
    {
      id: "019A0000-0000-7000-8000-000000000003",
      name: "Discussion",
      sortOrder: 2,
      colorKey: null,
      iconKey: null,
      isBuiltIn: true,
      isArchived: false,
    },
  ]);
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
