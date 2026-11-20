import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import type { ComponentProps, Ref } from "react";

/** Props for {@link TextField}. */
export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  readonly testId?: string | undefined;
  readonly onFocus?: ComponentProps<"input">["onFocus"];
  /** An inline validation message. It marks the input invalid and describes it. */
  readonly error?: string | null | undefined;
  readonly errorTestId?: string | undefined;
}

/** A labelled single-line input with an optional inline validation message. */
export function TextField({
  label,
  value,
  onValueChange,
  inputRef,
  testId,
  onFocus,
  error,
  errorTestId,
}: TextFieldProps) {
  const invalid = error !== null && error !== undefined;
  return (
    <Field.Root invalid={invalid} className="flex flex-col gap-1.5">
      <Field.Label className="text-[13px] font-medium text-fg-muted">{label}</Field.Label>
      <Input
        ref={inputRef}
        value={value}
        onValueChange={onValueChange}
        onFocus={onFocus}
        data-testid={testId}
        autoComplete="off"
        spellCheck={false}
        className="h-9 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus data-invalid:border-danger"
      />
      {invalid ? (
        <Field.Error match data-testid={errorTestId} className="text-[13px] text-danger">
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}
