import type { StatusProjection } from "@task-tracker/contracts";
import { ListChecks } from "lucide-react";
import { RowLookupMenu, type RowLookupEntry } from "./row-lookup-menu.js";

/** Props for {@link ItemStatusMenu}. */
export interface ItemStatusMenuProps {
  readonly statuses: ReadonlyArray<typeof StatusProjection.Type>;
  readonly statusId: string | null;
  readonly onChange: (statusId: string | null) => void;
}

/** Labels an archived status so it can still show as the item's current choice. */
const statusEntry = (status: typeof StatusProjection.Type): RowLookupEntry => ({
  id: status.id,
  label: status.isArchived ? `${status.name} (archived)` : status.name,
  isArchived: status.isArchived,
  sortOrder: status.sortOrder,
});

/**
 * The Set status submenu of any item row menu. The check mark follows the stored status, so a
 * Done choice cancelled at its confirmation stays unchecked.
 */
export function ItemStatusMenu({ statuses, statusId, onChange }: ItemStatusMenuProps) {
  return (
    <RowLookupMenu
      label="Set status"
      icon={<ListChecks size={14} />}
      entries={statuses.map(statusEntry)}
      currentId={statusId}
      onSelect={onChange}
      testId="item-menu-set-status"
    />
  );
}
