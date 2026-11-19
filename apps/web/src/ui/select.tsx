import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import type { FocusEvent, KeyboardEvent, Ref } from "react";
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
  /** `sm` fits compact property rows. */
  readonly size?: "md" | "sm" | undefined;
  /** Controlled open state for pickers that separate browsing from committing. */
  readonly open?: boolean | undefined;
  /** Called when the popup opens or closes, with the Base UI reason string. */
  readonly onOpenChange?: ((open: boolean, reason: string) => void) | undefined;
  /** Ref forwarded to the trigger button. */
  readonly triggerRef?: Ref<HTMLButtonElement> | undefined;
  /** Keydown handler on the trigger button. */
  readonly onTriggerKeyDown?: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
  /** Blur handler on the trigger button. */
  readonly onTriggerBlur?: ((event: FocusEvent<HTMLButtonElement>) => void) | undefined;
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
  size = "md",
  open,
  onOpenChange,
  triggerRef,
  onTriggerKeyDown,
  onTriggerBlur,
}: SelectProps<Value>) {
  const handleChange = (next: Value | null) => {
    if (next !== null) {
      onValueChange(next);
    }
  };
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={handleChange}
      disabled={disabled}
      items={options}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined
        ? {}
        : {
            onOpenChange: (nextOpen, details) => onOpenChange(nextOpen, details.reason),
          })}
    >
      <BaseSelect.Trigger
        ref={triggerRef}
        aria-label={ariaLabel}
        data-testid={testId}
        onKeyDown={onTriggerKeyDown}
        onBlur={onTriggerBlur}
        className={cx(
          size === "md" ? "h-9 px-3 text-sm" : "h-8 px-2.5 text-[13px]",
          "inline-flex min-w-24 cursor-default items-center justify-between gap-2 rounded-control border border-line-strong bg-canvas text-fg outline-none transition-colors hover:bg-hover focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus data-disabled:bg-hover data-disabled:text-fg-subtle data-disabled:opacity-70",
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
