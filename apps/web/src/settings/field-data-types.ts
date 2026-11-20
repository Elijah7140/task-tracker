import type { FieldDataType as FieldDataTypeSchema } from "@task-tracker/contracts";
import type { SelectOption } from "../ui/select.js";

/** A custom field's storage type. */
export type FieldDataType = typeof FieldDataTypeSchema.Type;

/** Every field type in the order the type pickers list them. */
export const FIELD_DATA_TYPE_OPTIONS: ReadonlyArray<SelectOption<FieldDataType>> = [
  { value: "Text", label: "Text" },
  { value: "Number", label: "Number" },
  { value: "Date", label: "Date" },
  { value: "Boolean", label: "Boolean" },
  { value: "Choice", label: "Choice" },
];
