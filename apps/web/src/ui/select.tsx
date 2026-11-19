import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "./class-names.js";

/** One option in a {@link Select}. */
export interface SelectOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

/** Props for {@link Select}. */
export interface SelectProps<Value extends string> {
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
  readonly options: ReadonlyArray<SelectOption<Value>>;
  readonly ariaLabel: string;
  readonly disabled?: boolean | undefined;
  readonly testId?: string | undefined;
  readonly className?: string | undefined;
}

/** A single-selection dropdown built on Base UI with the shared raised surface tokens. */
export function Select<Value extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  disabled = false,
  testId,
  className,
}: SelectProps<Value>) {
  const handleChange = (next: Value | null) => {
    if (next !== null) {
      onValueChange(next);
    }
  };
  return (
    <BaseSelect.Root value={value} onValueChange={handleChange} disabled={disabled} items={options}>
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        data-testid={testId}
        className={cx(
          "inline-flex h-9 min-w-24 cursor-default items-center justify-between gap-2 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg outline-none transition-colors hover:bg-hover focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus data-disabled:bg-hover data-disabled:text-fg-subtle data-disabled:opacity-70",
          className,
        )}
      >
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="text-fg-subtle">
          <ChevronDown size={14} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} align="start" className="z-50 outline-none">
          <BaseSelect.Popup className="min-w-28 rounded-card border border-line bg-raised p-1 text-fg shadow-raised outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  className="flex h-8 cursor-default items-center justify-between gap-2 rounded-[0.375rem] px-2 text-sm outline-none select-none data-highlighted:bg-hover"
                >
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="text-accent-text">
                    <Check size={14} aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
