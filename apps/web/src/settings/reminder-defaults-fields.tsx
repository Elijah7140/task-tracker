import { Input } from "@base-ui/react/input";
import { Checkbox } from "../ui/checkbox.js";
import { cx } from "../ui/class-names.js";
import { fieldStyles } from "../ui/field-styles.js";
import { Select } from "../ui/select.js";
import { defaultOffsetOptions, type ReminderDefaultsDraft } from "./reminder-settings-draft.js";

/** Props for {@link ReminderDefaultsFields}. */
export interface ReminderDefaultsFieldsProps {
  readonly draft: ReminderDefaultsDraft;
  readonly onChange: (change: Partial<ReminderDefaultsDraft>) => void;
}

/** A time box for a local wall-clock time, such as the date-only reminder time. */
export function ReminderTimeInput({
  id,
  value,
  onValueChange,
  disabled = false,
  testId,
}: {
  readonly id: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly testId: string;
}) {
  return (
    <Input
      id={id}
      type="time"
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      step={value.length > 5 ? 1 : 60}
      data-testid={testId}
      className={cx(
        fieldStyles.control,
        "w-full tabular-nums disabled:bg-hover disabled:text-fg-subtle disabled:opacity-70",
      )}
    />
  );
}

/**
 * The global reminder defaults (§7.12): whether items remind, how long before
 * the due moment, and the time that stands in for a date-only due date.
 */
export function ReminderDefaultsFields({ draft, onChange }: ReminderDefaultsFieldsProps) {
  return (
    <section aria-labelledby="global-reminders-heading" className="flex flex-col gap-2.5">
      <h3 id="global-reminders-heading" className="text-sm font-semibold text-fg">
        Reminders
      </h3>
      <Checkbox
        checked={draft.enabled}
        onCheckedChange={(enabled) => onChange({ enabled })}
        testId="global-reminders-enabled"
      >
        Remind me about open items with a due date
      </Checkbox>
      <div className="grid grid-cols-1 items-center gap-x-3 gap-y-2.5 sm:grid-cols-[13rem_13.5rem]">
        <span aria-hidden="true" className="text-sm text-fg">
          Default reminder
        </span>
        <Select
          value={draft.offset}
          onValueChange={(offset) => onChange({ offset })}
          options={defaultOffsetOptions(draft.offset)}
          ariaLabel="Default reminder"
          testId="global-reminder-offset"
        />
        <label htmlFor="global-reminder-time" className="text-sm text-fg">
          Date-only items remind at
        </label>
        <ReminderTimeInput
          id="global-reminder-time"
          value={draft.time}
          onValueChange={(time) => onChange({ time })}
          testId="global-reminder-time"
        />
      </div>
    </section>
  );
}
