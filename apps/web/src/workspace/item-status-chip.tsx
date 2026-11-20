/** Displays the item's current workflow status, including a stored archived status. */
export function ItemStatusChip({ name }: { readonly name: string | undefined }) {
  if (name === undefined) {
    return null;
  }
  return (
    <span
      data-testid="item-status-chip"
      title={name}
      className="ml-auto max-w-[45%] shrink-0 truncate rounded-full bg-hover px-2 py-0.5 text-xs text-fg-muted"
    >
      {name}
    </span>
  );
}
