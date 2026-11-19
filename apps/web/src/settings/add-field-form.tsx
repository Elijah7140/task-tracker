import { Input } from "@base-ui/react/input";
import { type FormEvent, useState } from "react";
import { UNSAVED_SETTINGS_UNDO_MESSAGE, useUndoBlocker } from "../shell/undo-blockers.js";
import { Button } from "../ui/button.js";
import { Select } from "../ui/select.js";
import { FIELD_DATA_TYPE_OPTIONS, type FieldDataType } from "./field-data-types.js";
import type { FieldDefinition } from "./use-field-actions.js";

/** Props for {@link AddFieldForm}. */
export interface AddFieldFormProps {
  /** Creates the field and resolves with it, or with `null` when refused. */
  readonly onCreate: (name: string, dataType: FieldDataType) => Promise<FieldDefinition | null>;
}

/**
 * The add row of the field manager. A saved field clears the name but keeps
 * the chosen type, so several fields of one type are quick to add; a refused
 * name stays in the box so it can be fixed.
 */
export function AddFieldForm({ onCreate }: AddFieldFormProps) {
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState<FieldDataType>("Text");

  useUndoBlocker(name.trim() !== "", UNSAVED_SETTINGS_UNDO_MESSAGE);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((await onCreate(name, dataType)) !== null) {
      setName("");
    }
  };

  return (
    <form className="flex items-center gap-2 pt-1" onSubmit={(event) => void handleSubmit(event)}>
      <Input
        value={name}
        onValueChange={setName}
        placeholder="New field name"
        aria-label="New field name"
        autoComplete="off"
        spellCheck={false}
        data-testid="field-new-name"
        className="h-9 min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus"
      />
      <Select
        value={dataType}
        onValueChange={setDataType}
        options={FIELD_DATA_TYPE_OPTIONS}
        ariaLabel="New field type"
        testId="field-new-type"
        className="w-32"
      />
      <Button type="submit" data-testid="field-add">
        Add field
      </Button>
    </form>
  );
}
