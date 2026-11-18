import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { nameKey, normalizeName } from "../metadata/names.js";
import { orderRows } from "../metadata/order-rows.js";
import type { FieldDataType } from "./field-data-type.js";

/** A custom field with an immutable key and a global or project scope. */
export interface FieldDefinition {
  readonly id: string;
  readonly key: string;
  readonly displayName: string;
  readonly dataType: FieldDataType;
  readonly projectId: string | null;
  readonly isArchived: boolean;
  readonly sortOrder: number;
}

function uniqueFieldKey(displayName: string, fields: readonly FieldDefinition[]): string {
  // Only ASCII alphanumerics survive the legacy slug rule. Kelvin sign lowercases to ASCII k.
  const slug =
    displayName
      .replace(/[A-ZK]/g, (character) => character.toLowerCase())
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "field";
  const existing = new Set(fields.map((field) => nameKey(field.key)));

  let key = slug;
  for (let suffix = 2; existing.has(nameKey(key)); suffix++) {
    const ending = `-${suffix}`;
    key = slug.slice(0, 300 - ending.length) + ending;
  }
  return key;
}

function ensureUniqueName(fields: readonly FieldDefinition[], candidate: FieldDefinition): void {
  if (candidate.isArchived) {
    return;
  }
  const key = nameKey(candidate.displayName);
  const duplicate = fields.some(
    (field) =>
      field.id !== candidate.id &&
      !field.isArchived &&
      (field.projectId === null ||
        candidate.projectId === null ||
        field.projectId === candidate.projectId) &&
      nameKey(field.displayName) === key,
  );
  if (duplicate) {
    throw new MetadataRuleError("Field name is already visible in this project.");
  }
}

/** Creates a field using all definitions to reserve keys and check overlapping scopes. */
export function createField(
  id: string,
  name: string,
  dataType: FieldDataType,
  projectId: string | null,
  fields: readonly FieldDefinition[],
): FieldDefinition {
  const displayName = normalizeName(name, "Field name");
  const field = {
    id,
    key: uniqueFieldKey(displayName, fields),
    displayName,
    dataType,
    projectId,
    isArchived: false,
    sortOrder: fields.filter((other) => other.projectId === projectId).length,
  };
  ensureUniqueName(fields, field);
  return field;
}

/** Renames a field while preserving its key and checking visibility against all definitions. */
export function renameField(
  field: FieldDefinition,
  name: string,
  fields: readonly FieldDefinition[],
): FieldDefinition {
  const renamed = { ...field, displayName: normalizeName(name, "Field name") };
  ensureUniqueName(fields, renamed);
  return renamed;
}

/** Changes type only when no stored value exists, counting values on soft-deleted items. */
export function changeFieldType(
  field: FieldDefinition,
  dataType: FieldDataType,
  hasValues: boolean,
): FieldDefinition {
  if (hasValues && field.dataType !== dataType) {
    throw new MetadataRuleError("A field with values cannot change type.");
  }
  return { ...field, dataType };
}

/** Hides a field from editors while retaining its key and stored values. */
export function archiveField(field: FieldDefinition): FieldDefinition {
  return { ...field, isArchived: true };
}

/** Restores a field after checking name conflicts against all definitions. */
export function restoreField(
  field: FieldDefinition,
  fields: readonly FieldDefinition[],
): FieldDefinition {
  const restored = { ...field, isArchived: false };
  ensureUniqueName(fields, restored);
  return restored;
}

function compareFieldOrder(left: FieldDefinition, right: FieldDefinition): number {
  return left.sortOrder - right.sortOrder;
}

/** Lists global and project fields, including archived fields, for management. */
export function listFields(
  fields: readonly FieldDefinition[],
  projectId: string | null,
): FieldDefinition[] {
  return fields
    .filter((field) => field.projectId === null || field.projectId === projectId)
    .sort(compareFieldOrder);
}

/** Lists active global fields first, then active project fields, ordered within each scope. */
export function effectiveFields(
  fields: readonly FieldDefinition[],
  projectId: string,
): FieldDefinition[] {
  const visible = listFields(fields, projectId).filter((field) => !field.isArchived);
  return [
    ...visible.filter((field) => field.projectId === null),
    ...visible.filter((field) => field.projectId !== null),
  ];
}

/** Returns the reordered rows in the exact scope, including its archived rows. */
export function reorderFields(
  fields: readonly FieldDefinition[],
  projectId: string | null,
  ids: readonly string[],
): FieldDefinition[] {
  return orderRows(
    fields.filter((field) => field.projectId === projectId),
    ids,
  );
}
