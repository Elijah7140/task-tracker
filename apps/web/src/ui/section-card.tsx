import type { ReactNode } from "react";
import { cx } from "./class-names.js";

/** Props for {@link SectionCard}. */
export interface SectionCardProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Controls shown beside the heading, such as a filter toggle. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string | undefined;
  readonly className?: string | undefined;
}

/** A rounded surface card with a section heading for settings and list panels. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  testId,
  className,
}: SectionCardProps) {
  return (
    <section
      data-testid={testId}
      className={cx(
        "flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description === undefined ? null : (
            <p className="text-[13px] text-fg-muted">{description}</p>
          )}
        </div>
        {actions === undefined ? null : <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
