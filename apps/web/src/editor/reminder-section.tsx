import type { Item, ReminderChoice } from "@task-tracker/contracts";
import { Select, type SelectOption } from "../ui/select.js";
import { EditorField } from "./editor-field.js";
import { EditorGroup } from "./editor-group.js";
import {
  describeOffset,
  REMINDER_OFFSETS,
  reminderFromValue,
  reminderValue,
  storedReminder,
} from "./reminder-draft.js";

type Choice = typeof ReminderChoice.Type;

/** Props for {@link ReminderSection}. */
export interface ReminderSectionProps {
  readonly item: typeof Item.Type;
  /** The user's choice, or null to show the stored one. */
  readonly draft: Choice | null;
  /** Whether the draft has a due date, which a reminder needs. */
  readonly hasDueDate: boolean;
  readonly onChange: (choice: Choice) => void;
}

function options(stored: Choice): ReadonlyArray<SelectOption<string>> {
  const listed = [
    { value: "default", label: "Default" },
    { value: "none", label: "None" },
    ...REMINDER_OFFSETS.map(({ minutes, label }) => ({ value: String(minutes), label })),
  ];
  const value = reminderValue(stored);
  if (stored.kind !== "offset" || listed.some((option) => option.value === value)) {
    return listed;
  }
  return [...listed, { value, label: describeOffset(stored.minutes) }];
}

/**
 * The editor's Reminder choice (§7.12): the effective default, none, or an
 * offset before the due moment. It saves with the item.
 */
export function ReminderSection({ item, draft, hasDueDate, onChange }: ReminderSectionProps) {
  const stored = storedReminder(item);
  const shown = draft ?? stored;
  return (
    <EditorGroup title="Reminder" testId="item-editor-reminder">
      <div className="flex flex-col gap-1.5">
        <EditorField label="Reminder">
          <Select
            value={reminderValue(shown)}
            onValueChange={(value) => onChange(reminderFromValue(value))}
            options={options(stored)}
            ariaLabel="Reminder"
            testId="item-editor-reminder-choice"
            size="sm"
            className="w-full"
          />
        </EditorField>
        {hasDueDate || shown.kind === "none" ? null : (
          <p data-testid="item-editor-reminder-hint" className="text-[13px] text-fg-muted">
            Reminders need a due date.
          </p>
        )}
      </div>
    </EditorGroup>
  );
}
