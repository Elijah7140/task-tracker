import { Input } from "@base-ui/react/input";
import { X } from "lucide-react";
import { DateField } from "../date-picker/date-field.js";
import { Button } from "../ui/button.js";
import { fieldStyles } from "../ui/field-styles.js";
import { emptyTimePlaceholder } from "./time-placeholder.js";

/** Props for {@link ClearableInput}. */
export interface ClearableInputProps {
  readonly type: "date" | "time";
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The clear button's accessible name, such as "Clear due date". */
  readonly clearLabel: string;
  readonly testId: string;
  readonly clearTestId: string;
  /** Optional locale override for empty time placeholders and the date picker. */
  readonly locale?: string | undefined;
}

/** Names the calendar button after the clear button, so "Clear due date" gives "Choose due date". */
function pickLabelFor(clearLabel: string): string {
  return clearLabel.replace(/^Clear\b/, "Choose");
}

/**
 * A date or time input with a button that removes the value, as the legacy
 * editor's pickers had. Dates are typeable `YYYY-MM-DD` text with the app's
 * calendar popover. Empty time inputs expose a neutral dash placeholder
 * matching the locale's 12-hour or 24-hour clock format.
 * Use inside an {@link EditorField}.
 */
export function ClearableInput(props: ClearableInputProps) {
  const { value, onValueChange, clearLabel, clearTestId } = props;
  const empty = value === "";
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ValueControl {...props} />
      <Button
        variant="ghost"
        size="icon"
        aria-label={clearLabel}
        disabled={empty}
        onClick={() => onValueChange("")}
        data-testid={clearTestId}
      >
        <X size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}

function ValueControl({
  type,
  value,
  onValueChange,
  clearLabel,
  testId,
  locale,
}: ClearableInputProps) {
  if (type === "date") {
    return (
      <DateField
        value={value}
        onValueChange={onValueChange}
        pickLabel={pickLabelFor(clearLabel)}
        testId={testId}
        locale={locale}
      />
    );
  }
  const timePlaceholder = emptyTimePlaceholder(locale);
  return (
    <Input
      type={type}
      value={value}
      onValueChange={onValueChange}
      placeholder={timePlaceholder}
      aria-placeholder={timePlaceholder}
      data-empty={value === "" ? "true" : undefined}
      data-testid={testId}
      className={fieldStyles.compactControl}
    />
  );
}
