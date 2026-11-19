import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./class-names.js";

/** Props for {@link Checkbox}. */
export interface CheckboxProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly children: ReactNode;
  readonly ariaLabel?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly testId?: string | undefined;
}

/**
 * A Base UI checkbox paired with an inline label. A disabled box keeps the
 * hover fill and draws its tick in fg-subtle, which reaches 4.5:1 on that fill
 * in both themes; the white on-accent tick would vanish on it in light mode.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  children,
  ariaLabel,
  disabled = false,
  testId,
}: CheckboxProps) {
  return (
    <label
      className={cx(
        "inline-flex cursor-default items-center gap-2 select-none",
        disabled && "text-fg-subtle opacity-70",
      )}
    >
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={testId}
        className="grid size-4 shrink-0 place-items-center rounded-[0.25rem] border border-control-outline bg-canvas text-on-accent outline-none transition-colors focus-visible:ring-3 focus-visible:ring-focus data-checked:border-accent data-checked:bg-accent data-disabled:border-control-outline data-disabled:bg-hover data-disabled:text-fg-subtle"
      >
        <BaseCheckbox.Indicator className="grid place-items-center">
          <Check size={12} strokeWidth={2.75} aria-hidden="true" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span className="text-sm leading-snug">{children}</span>
    </label>
  );
}
