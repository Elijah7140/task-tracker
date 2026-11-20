import type { ReactNode } from "react";

/** A titled block of the details panel, such as Ticket or Comments. */
export function DetailSection({
  title,
  testId,
  children,
}: {
  readonly title: string;
  readonly testId?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={testId} className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** One label and value in the details panel. A missing value leaves the row out. */
export function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
}) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 text-[13px]">
      <dt className="truncate text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{value}</dd>
    </div>
  );
}
