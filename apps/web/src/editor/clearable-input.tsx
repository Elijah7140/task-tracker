import { Input } from "@base-ui/react/input";
import { X } from "lucide-react";
import { Button } from "../ui/button.js";
import { fieldStyles } from "../ui/field-styles.js";
import { emptyTimePlaceholder } from "./time-placeholder.js";

/** Props for {@link ClearableInput}. */
export interface ClearableInputProps {
  readonly type: "date" | "time" | "datetime-local";
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The clear button's accessible name, such as "Clear due date". */
  readonly clearLabel: string;
  readonly testId: string;
  readonly clearTestId: string;
  /** Optional locale override for empty time placeholder formatting. */
  readonly locale?: string | undefined;
}

/**
 * A native date or time input with a button that removes the value, as the
 * legacy editor's pickers had. Empty time inputs expose a neutral dash
 * placeholder matching the locale's 12-hour or 24-hour clock format.
 * Use inside an {@link EditorField}.
 */
export function ClearableInput({
  type,
  value,
  onValueChange,
  clearLabel,
  testId,
  clearTestId,
  locale,
}: ClearableInputProps) {
  const empty = value === "";
  const timePlaceholder = type === "time" ? emptyTimePlaceholder(locale) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        type={type}
        value={value}
        onValueChange={onValueChange}
        placeholder={timePlaceholder}
        aria-placeholder={timePlaceholder}
        data-empty={empty ? "true" : undefined}
        data-testid={testId}
        className={fieldStyles.compactControl}
      />
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
