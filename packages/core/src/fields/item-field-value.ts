import type { FieldValueInput } from "./field-value-input.js";

/** The typed columns of one custom value stored for an item. */
export interface ItemFieldValue extends Required<FieldValueInput> {
  readonly itemId: string;
}
