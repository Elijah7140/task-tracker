import type { FieldDefinitionProjection, ItemFieldValue } from "@task-tracker/contracts";

type Definition = typeof FieldDefinitionProjection.Type;
type Stored = typeof ItemFieldValue.Type;

/** A custom field shown in the editor with the item's stored value, if any. */
export interface EditorField {
  readonly definition: Definition;
  readonly stored: Stored | undefined;
}

/** The editor's editable and read-only custom fields for one item. */
export interface EditorFieldList {
  /** Active fields in the server's effective order: global first, then project. */
  readonly active: ReadonlyArray<EditorField>;
  /** Archived fields the item still has a value for, read-only, in sort order. */
  readonly archived: ReadonlyArray<EditorField>;
}

/**
 * Builds the editor's field list like the legacy `CustomFieldInputLoader`.
 * `effective` comes from ListEffectiveFields and `all` from ListFields, which
 * also returns archived fields in the project's scope.
 */
export function editorFields(
  effective: ReadonlyArray<Definition>,
  all: ReadonlyArray<Definition>,
  values: ReadonlyArray<Stored>,
): EditorFieldList {
  const storedFor = (definition: Definition) =>
    values.find((value) => value.fieldDefinitionId === definition.id);
  const withValue = (definition: Definition) => ({ definition, stored: storedFor(definition) });
  const archived = all
    .filter((definition) => definition.isArchived && storedFor(definition) !== undefined)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
  return { active: effective.map(withValue), archived: archived.map(withValue) };
}
