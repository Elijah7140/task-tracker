import type { Guid } from "@task-tracker/contracts";
import { TaskTrackerClient } from "./task-tracker-client.js";

type Id = typeof Guid.Type;

/**
 * Reactivity key shared by every query that shows field definitions: field
 * settings, effective-field pickers and anything else listing fields.
 */
export const FIELDS_KEY = "fields";

/** Reactivity key shared by every query that shows field choices. */
export const FIELD_CHOICES_KEY = "fields:choices";

/** Reactivity key for one field's choices. */
export const fieldChoicesKey = (fieldId: Id) => `${FIELD_CHOICES_KEY}:${fieldId}`;

/** Reactivity key for one item's stored custom-field values. Item edits invalidate it. */
export const itemFieldValuesKey = (itemId: Id) => `item-field-values:${itemId}`;

/** Keys a field-definition mutation invalidates, so every field list and picker refreshes. */
export const FIELD_MUTATION_KEYS: ReadonlyArray<string> = [FIELDS_KEY];

/**
 * Keys a choice mutation invalidates. Only that field's choice queries refresh,
 * so unsaved text in other fields' choice panels stays untouched.
 */
export const choiceMutationKeys = (fieldId: Id): ReadonlyArray<string> => [
  fieldChoicesKey(fieldId),
];

/**
 * Field definitions including archived ones, for settings and for the item
 * editor's read-only archived values. `null` lists the global fields; a
 * project ID lists global and that project's fields.
 */
export const fieldsAtom = (projectId: Id | null) =>
  TaskTrackerClient.query("ListFields", { projectId }, { reactivityKeys: [FIELDS_KEY] });

/** Active global fields, then active project fields, each in saved order, for pickers. */
export const effectiveFieldsAtom = (projectId: Id) =>
  TaskTrackerClient.query("ListEffectiveFields", { projectId }, { reactivityKeys: [FIELDS_KEY] });

/** One field's choices, including archived ones, in saved order. */
export const fieldChoicesAtom = (fieldId: Id) =>
  TaskTrackerClient.query(
    "ListFieldChoices",
    { fieldId },
    { reactivityKeys: [FIELD_CHOICES_KEY, fieldChoicesKey(fieldId)] },
  );

/** One item's stored custom-field values. */
export const itemFieldValuesAtom = (itemId: Id) =>
  TaskTrackerClient.query(
    "LoadItemFieldValues",
    { itemId },
    { reactivityKeys: [itemFieldValuesKey(itemId), FIELDS_KEY] },
  );

/** Creates a global or project field. */
export const createFieldAtom = TaskTrackerClient.mutation("CreateField");

/** Renames a field without changing its key. */
export const renameFieldAtom = TaskTrackerClient.mutation("RenameField");

/** Changes the type of a field that has no stored values. */
export const changeFieldTypeAtom = TaskTrackerClient.mutation("ChangeFieldType");

/** Archives a field while keeping its values. */
export const archiveFieldAtom = TaskTrackerClient.mutation("ArchiveField");

/** Restores an archived field after rechecking its name. */
export const restoreFieldAtom = TaskTrackerClient.mutation("RestoreField");

/** Saves the complete field order of one scope, archived fields included. */
export const reorderFieldsAtom = TaskTrackerClient.mutation("ReorderFields");

/** Adds a choice to a choice field. */
export const addFieldChoiceAtom = TaskTrackerClient.mutation("AddFieldChoice");

/** Renames a choice; items keep referring to it by ID. */
export const renameFieldChoiceAtom = TaskTrackerClient.mutation("RenameFieldChoice");

/** Archives a choice while items keep their value. */
export const archiveFieldChoiceAtom = TaskTrackerClient.mutation("ArchiveFieldChoice");

/** Restores an archived choice after rechecking its label. */
export const restoreFieldChoiceAtom = TaskTrackerClient.mutation("RestoreFieldChoice");

/** Saves the complete choice order of one field, archived choices included. */
export const reorderFieldChoicesAtom = TaskTrackerClient.mutation("ReorderFieldChoices");
