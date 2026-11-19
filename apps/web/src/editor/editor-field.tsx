import { Field } from "@base-ui/react/field";
import type { ReactNode } from "react";
import { cx } from "../ui/class-names.js";
import { fieldStyles } from "../ui/field-styles.js";

/** Props for {@link EditorField}. */
export interface EditorFieldProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly labelTestId?: string | undefined;
  /** `row` puts the label beside the control, as a compact property row. */
  readonly layout?: "row" | "stacked" | undefined;
  readonly className?: string | undefined;
}

/** A label with one editor control. Base UI links the label to the control inside. */
export function EditorField({
  label,
  children,
  labelTestId,
  layout = "row",
  className,
}: EditorFieldProps) {
  const row = layout === "row";
  return (
    <Field.Root className={cx(row ? fieldStyles.row : fieldStyles.field, className)}>
      <Field.Label
        data-testid={labelTestId}
        title={row ? label : undefined}
        className={row ? fieldStyles.rowLabel : fieldStyles.label}
      >
        {label}
      </Field.Label>
      {row ? <div className="flex min-w-0 flex-col gap-1">{children}</div> : children}
    </Field.Root>
  );
}
