import type { Guid } from "@task-tracker/contracts";
import { TaskTrackerClient } from "./task-tracker-client.js";

type Id = typeof Guid.Type;

/** Reactivity key shared by every query that shows custom-field definitions or choices. */
export const FIELDS_KEY = "fields";

/** Reactivity key for one item's stored custom-field values. Item edits invalidate it. */
export const itemFieldValuesKey = (itemId: Id) => `item-field-values:${itemId}`;

/** Active global fields, then active project fields, in display order (§7.1). */
export const effectiveFieldsAtom = (projectId: Id) =>
  TaskTrackerClient.query("ListEffectiveFields", { projectId }, { reactivityKeys: [FIELDS_KEY] });

/** Global and project fields, including archived ones, for read-only archived values. */
export const projectFieldsAtom = (projectId: Id) =>
  TaskTrackerClient.query("ListFields", { projectId }, { reactivityKeys: [FIELDS_KEY] });

/** One choice field's choices, including archived ones, in sort order. */
export const fieldChoicesAtom = (fieldId: Id) =>
  TaskTrackerClient.query("ListFieldChoices", { fieldId }, { reactivityKeys: [FIELDS_KEY] });

/** One item's stored custom-field values. */
export const itemFieldValuesAtom = (itemId: Id) =>
  TaskTrackerClient.query(
    "LoadItemFieldValues",
    { itemId },
    { reactivityKeys: [itemFieldValuesKey(itemId), FIELDS_KEY] },
  );
