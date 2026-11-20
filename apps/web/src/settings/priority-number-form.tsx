import { Input } from "@base-ui/react/input";
import { Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { UNSAVED_SETTINGS_UNDO_MESSAGE, useUndoBlocker } from "../shell/undo-blockers.js";
import { Button } from "../ui/button.js";
import { fieldStyles } from "../ui/field-styles.js";
import { Tooltip } from "../ui/tooltip.js";

interface PriorityNumberFormProps {
  readonly label: string;
  readonly savedNumber: number | null;
  readonly onSave: (text: string) => Promise<boolean>;
}

/** Saves a number with Enter or the check button. Escape discards the draft. */
export function PriorityNumberForm({ label, savedNumber, onSave }: PriorityNumberFormProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = savedNumber?.toString() ?? "";
  const value = draft ?? saved;
  const dirty = value !== saved;
  useUndoBlocker(dirty || saving, UNSAVED_SETTINGS_UNDO_MESSAGE);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving) {
      return;
    }
    setSaving(true);
    try {
      if (await onSave(value)) {
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mr-2 flex w-28 shrink-0 items-center gap-0.5"
      onSubmit={(event) => void submit(event)}
    >
      <Input
        value={value}
        onValueChange={setDraft}
        placeholder="Number"
        aria-label={`Number for ${label}`}
        data-testid="priority-number"
        autoComplete="off"
        inputMode="numeric"
        readOnly={saving}
        onKeyDown={(event) => {
          if (event.key === "Escape" && dirty && !saving) {
            event.stopPropagation();
            setDraft(null);
          }
        }}
        className={fieldStyles.compactControl}
      />
      <Tooltip content="Save number">
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label={`Save number for ${label}`}
          data-testid="priority-save-number"
          disabled={!dirty || saving}
        >
          <Check size={14} aria-hidden="true" />
        </Button>
      </Tooltip>
    </form>
  );
}
