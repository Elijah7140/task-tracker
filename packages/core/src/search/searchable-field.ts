import type { FieldDataType } from "../fields/field-data-type.js";

/** The built-in item column or custom definition backing a searchable field. */
export type FieldSource =
  | { readonly kind: "builtIn"; readonly column: string }
  | { readonly kind: "custom"; readonly fieldDefinitionId: string };

/** A built-in column or active custom field available for search (§7.2). */
export interface SearchableField {
  readonly key: string;
  readonly displayName: string;
  readonly dataType: FieldDataType;
  readonly fieldDefinitionId: string | null;
  readonly source: FieldSource;
}

/** A selectable option for a choice search filter. */
export interface SearchChoice {
  readonly id: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly name: string | null;
  readonly number: number | null;
}

/** True when `field` maps to a built-in item column rather than a custom field definition. */
export function isBuiltInSearchField(field: SearchableField): boolean {
  return field.fieldDefinitionId === null;
}
