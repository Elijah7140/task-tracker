import { Input } from "@base-ui/react/input";
import type { KeyboardEvent } from "react";
import { cx } from "../ui/class-names.js";
import { stepDurationAmount } from "./duration-input.js";

/** Props for {@link ThresholdInput}. */
export interface ThresholdInputProps {
  readonly id: string;
  readonly value: string;
  readonly onValueChange: (text: string) => void;
  readonly testId: string;
  readonly disabled?: boolean | undefined;
  /** Width utility, such as `w-full` in a grid cell or `w-24` inline. */
  readonly widthClass: string;
}

const thresholdInputClass =
  "h-9 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg tabular-nums outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus disabled:bg-hover disabled:text-fg-subtle disabled:opacity-70";

/**
 * A decimal urgency threshold amount. ArrowUp and ArrowDown step by one unit
 * and stop at zero, like the legacy NumericUpDown. Typing stays free-form and
 * the settings card validates the result.
 */
export function ThresholdInput({
  id,
  value,
  onValueChange,
  testId,
  disabled,
  widthClass,
}: ThresholdInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : null;
    if (step === null) {
      return;
    }
    event.preventDefault();
    onValueChange(stepDurationAmount(value, step));
  };

  return (
    <Input
      id={id}
      value={value}
      onValueChange={onValueChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      data-testid={testId}
      className={cx(thresholdInputClass, widthClass)}
    />
  );
}
