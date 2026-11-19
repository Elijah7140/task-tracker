import type { ReactNode } from "react";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { cx } from "../ui/class-names.js";

/** Props for {@link ProjectOverrideRow}. */
export interface ProjectOverrideRowProps {
  readonly label: string;
  readonly labelFor?: string | undefined;
  readonly dotClass?: string | undefined;
  readonly overridden: boolean;
  readonly onOverriddenChange: (overridden: boolean) => void;
  readonly onReset: () => void;
  readonly overrideTestId: string;
  readonly sourceTestId: string;
  readonly resetTestId: string;
  readonly children: ReactNode;
}

/**
 * One overridable setting row in Project Settings: label, Override checkbox,
 * value control, source indicator and Reset to global when overridden.
 */
export function ProjectOverrideRow({
  label,
  labelFor,
  dotClass,
  overridden,
  onOverriddenChange,
  onReset,
  overrideTestId,
  sourceTestId,
  resetTestId,
  children,
}: ProjectOverrideRowProps) {
  const lower = label.toLowerCase();
  const labelContent = (
    <>
      {dotClass === undefined ? null : (
        <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", dotClass)} />
      )}
      {label}
    </>
  );

  return (
    <div className="grid grid-cols-1 items-center gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[13.5rem_6.5rem_11.5rem_9.5rem_auto]">
      {labelFor === undefined ? (
        <span className="flex items-center gap-2 text-sm text-fg">{labelContent}</span>
      ) : (
        <label htmlFor={labelFor} className="flex items-center gap-2 text-sm text-fg">
          {labelContent}
        </label>
      )}

      <div>
        <Checkbox
          checked={overridden}
          onCheckedChange={onOverriddenChange}
          ariaLabel={`Override ${lower}`}
          testId={overrideTestId}
        >
          Override
        </Checkbox>
      </div>

      <div className="flex items-center gap-2">{children}</div>

      <span
        data-testid={sourceTestId}
        className={cx("text-[13px]", overridden ? "font-medium text-accent" : "text-fg-subtle")}
      >
        {overridden ? "Project override" : "Inherited from global"}
      </span>

      <div className="flex justify-start md:justify-end">
        {overridden ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            aria-label={`Reset ${lower} to global`}
            data-testid={resetTestId}
          >
            Reset to global
          </Button>
        ) : null}
      </div>
    </div>
  );
}
