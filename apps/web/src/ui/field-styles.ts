/**
 * Shared classes for labelled form controls in forms and editors, so inputs,
 * text areas and their messages look the same across screens.
 */
export const fieldStyles = {
  field: "flex min-w-0 flex-col gap-1.5",
  /** A property row: label on the left, control on the right. */
  row: "grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-3",
  rowLabel: "flex h-8 items-center truncate text-[13px] text-fg-muted",
  label: "text-[13px] font-medium text-fg-muted",
  control:
    "h-9 w-full min-w-0 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus aria-invalid:border-danger",
  /** A control in a compact property row. */
  compactControl:
    "h-8 w-full min-w-0 rounded-control border border-line-strong bg-canvas px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus aria-invalid:border-danger",
  textarea:
    "min-h-20 w-full resize-y rounded-control border border-line-strong bg-canvas px-3 py-2 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus",
  error: "text-[13px] text-danger",
} as const;
