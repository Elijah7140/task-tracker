import { Input } from "@base-ui/react/input";
import { type FormEvent, useState } from "react";
import { UNSAVED_SETTINGS_UNDO_MESSAGE, useUndoBlocker } from "../shell/undo-blockers.js";
import { Button } from "../ui/button.js";

/** Props for {@link AddChoiceForm}. */
export interface AddChoiceFormProps {
  readonly fieldName: string;
  /** Saves the label and resolves with whether it was accepted. */
  readonly onAdd: (label: string) => Promise<boolean>;
}

/**
 * The "new choice" box of one choices panel. Its text is local, so adding in
 * one panel never clears what was typed in another. A refused label stays in
 * the box so it can be fixed.
 */
export function AddChoiceForm({ fieldName, onAdd }: AddChoiceFormProps) {
  const [label, setLabel] = useState("");

  useUndoBlocker(label.trim() !== "", UNSAVED_SETTINGS_UNDO_MESSAGE);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onAdd(label)) {
      setLabel("");
    }
  };

  return (
    <form className="flex items-center gap-2" onSubmit={(event) => void handleSubmit(event)}>
      <Input
        value={label}
        onValueChange={setLabel}
        placeholder="New choice"
        aria-label={`New choice for ${fieldName}`}
        autoComplete="off"
        spellCheck={false}
        data-testid="choice-new-label"
        className="h-8 min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-2.5 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus"
      />
      <Button type="submit" size="md" data-testid="choice-add">
        Add choice
      </Button>
    </form>
  );
}
