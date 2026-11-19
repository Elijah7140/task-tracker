import { type ReactNode, useRef } from "react";
import { useFocusOnMount } from "./use-focus-on-mount.js";

/** Props for {@link PageHeader}. */
export interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly actions?: ReactNode;
  /** Focuses the title when the header mounts, for a covering page (§8). */
  readonly focusTitle?: boolean;
}

function PageTitle({ title, focus }: { readonly title: string; readonly focus: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(ref, focus);
  return (
    <h1
      ref={ref}
      tabIndex={focus ? -1 : undefined}
      className="truncate text-[1.75rem] leading-tight font-semibold tracking-tight outline-none"
    >
      {title}
    </h1>
  );
}

/** The title row every main-pane screen starts with. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  focusTitle = false,
}: PageHeaderProps) {
  return (
    <header className="mb-8 flex items-end justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow}
        <PageTitle title={title} focus={focusTitle} />
        {description === undefined ? null : <p className="text-fg-muted">{description}</p>}
      </div>
      {actions === undefined ? null : <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}
