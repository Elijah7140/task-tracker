import { cx } from "../ui/class-names.js";

/**
 * Displays the item's current workflow status, including a stored archived status. A chip
 * that may `wrap` shows the whole name over several lines, as on a card (§7.17); otherwise a
 * long name is cut off to keep a one-line row.
 */
export function ItemStatusChip({
  name,
  wrap = false,
}: {
  readonly name: string | undefined;
  readonly wrap?: boolean | undefined;
}) {
  if (name === undefined) {
    return null;
  }
  return (
    <span
      data-testid="item-status-chip"
      title={wrap ? undefined : name}
      className={cx(
        "ml-auto max-w-[45%] shrink-0 rounded-full bg-hover px-2 py-0.5 text-xs text-fg-muted",
        wrap ? "[overflow-wrap:anywhere]" : "truncate",
      )}
    >
      {name}
    </span>
  );
}
