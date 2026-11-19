import { useState } from "react";
import { Select } from "../ui/select.js";
import { FIELD_DATA_TYPE_OPTIONS, type FieldDataType } from "./field-data-types.js";
import type { FieldDefinition } from "./use-field-actions.js";

/** Props for {@link FieldTypeSelect}. */
export interface FieldTypeSelectProps {
  readonly field: FieldDefinition;
  /** Saves the type and resolves with whether the server accepted it. */
  readonly onChange: (dataType: FieldDataType) => Promise<boolean>;
}

/**
 * The type picker of one field row. It shows the chosen type while the save
 * runs and the saved type again when the server refuses it.
 */
export function FieldTypeSelect({ field, onChange }: FieldTypeSelectProps) {
  const [pendingType, setPendingType] = useState<FieldDataType | null>(null);
  if (pendingType !== null && pendingType === field.dataType) {
    setPendingType(null);
  }

  const handleChange = async (dataType: FieldDataType) => {
    if (dataType === field.dataType) {
      return;
    }
    setPendingType(dataType);
    if (!(await onChange(dataType))) {
      setPendingType(null);
    }
  };

  return (
    <Select
      value={pendingType ?? field.dataType}
      onValueChange={(dataType) => void handleChange(dataType)}
      options={FIELD_DATA_TYPE_OPTIONS}
      ariaLabel={`Type of ${field.displayName}`}
      disabled={field.isArchived}
      testId="field-type"
      className="h-8 w-32"
    />
  );
}
