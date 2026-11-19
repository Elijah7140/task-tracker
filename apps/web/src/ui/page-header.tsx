import type { ReactNode } from "react";

/** Props for {@link PageHeader}. */
export interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly actions?: ReactNode;
}

/** The title row every main-pane screen starts with. */
export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex items-end justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow}
        <h1 className="truncate text-[1.75rem] leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        {description === undefined ? null : <p className="text-fg-muted">{description}</p>}
      </div>
      {actions === undefined ? null : <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}
