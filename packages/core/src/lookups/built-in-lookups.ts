import type { ItemType } from "./item-type.js";
import type { PriorityLevel } from "./priority-level.js";

const defaults = { colorKey: null, isBuiltIn: true, isArchived: false } as const;

/** Item type seeds from the legacy initial migration, in default display order. */
export const builtInItemTypes = Object.freeze([
  Object.freeze({
    ...defaults,
    id: "019A0000-0000-7000-8000-000000000001",
    name: "Change",
    sortOrder: 0,
    iconKey: null,
  }),
  Object.freeze({
    ...defaults,
    id: "019A0000-0000-7000-8000-000000000002",
    name: "Error",
    sortOrder: 1,
    iconKey: null,
  }),
  Object.freeze({
    ...defaults,
    id: "019A0000-0000-7000-8000-000000000003",
    name: "Discussion",
    sortOrder: 2,
    iconKey: null,
  }),
] as const satisfies readonly ItemType[]);

/** Priority seeds from the legacy initial migration, from highest to lowest. */
export const builtInPriorityLevels = Object.freeze([
  Object.freeze({
    ...defaults,
    id: "019A0000-0000-7000-8000-000000000101",
    name: "Critical",
    sortOrder: 0,
  }),
  Object.freeze({
    ...defaults,
    id: "019A0000-0000-7000-8000-000000000102",
    name: "High",
    sortOrder: 1,
  }),
  Object.freeze({
    ...defaults,
    id: "019A0000-0000-7000-8000-000000000103",
    name: "Medium",
    sortOrder: 2,
  }),
  Object.freeze({
    ...defaults,
    id: "019A0000-0000-7000-8000-000000000104",
    name: "Low",
    sortOrder: 3,
  }),
] as const satisfies readonly PriorityLevel[]);
