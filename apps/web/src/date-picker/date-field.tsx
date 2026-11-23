import { Input } from "@base-ui/react/input";
import { useState } from "react";
import { fieldStyles } from "../ui/field-styles.js";
import { parseTypedDate } from "./date-picker-month.js";
import { DatePickerButton } from "./date-picker-button.js";

/** Props for {@link DateField}. */
export interface DateFieldProps {
  /** The `YYYY-MM-DD` date, or `""` when none is set. */
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The calendar button's accessible name, such as "Choose due date". */
  readonly pickLabel: string;
  readonly testId: string;
  /** Names the text box when no field label is linked to it. */
  readonly ariaLabel?: string | undefined;
  readonly locale?: string | undefined;
}

/**
 * A typeable `YYYY-MM-DD` date with a calendar button. Typing reports each
 * complete, real date; blank text reports `""`. Text that is not a date is
 * marked invalid and leaves the value unchanged, and leaving the field puts the
 * current value back.
 */
export function DateField({
  value,
  onValueChange,
  pickLabel,
  testId,
  ariaLabel,
  locale,
}: DateFieldProps) {
  const [text, setText] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setText(value);
  }
  const parsed = parseTypedDate(text);
  const type = (next: string) => {
    setText(next);
    const date = parseTypedDate(next);
    if (date !== null && date !== value) {
      setShownValue(date);
      onValueChange(date);
    }
  };
  return (
    <>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onValueChange={type}
        onBlur={() => setText(value)}
        placeholder="YYYY-MM-DD"
        aria-label={ariaLabel}
        aria-invalid={parsed === null ? true : undefined}
        data-empty={value === "" ? "true" : undefined}
        data-testid={testId}
        className={fieldStyles.compactControl}
      />
      <DatePickerButton
        value={value}
        onSelect={onValueChange}
        label={pickLabel}
        testId={`${testId}-picker`}
        locale={locale}
      />
    </>
  );
}
