import { cx } from "../ui/class-names.js";

/** Props for {@link OverdueBadge}. */
export interface OverdueBadgeProps {
  readonly count: number;
}

/**
 * The overdue count as a subtle pill. A red dot and tint mark a non-zero count,
 * and the text carries the meaning without color.
 */
export function OverdueBadge({ count }: OverdueBadgeProps) {
  const overdue = count > 0;
  return (
    <span
      data-testid="project-overdue-count"
      data-overdue={overdue}
      className={cx(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        overdue ? "bg-urgency-overdue-soft text-urgency-overdue" : "text-fg-subtle",
      )}
    >
      <span
        aria-hidden="true"
        className={cx("size-1.5 rounded-full", overdue ? "bg-urgency-overdue" : "bg-line-strong")}
      />
      {count} overdue
    </span>
  );
}
