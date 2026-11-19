import type { StatusProjection } from "@task-tracker/contracts";
import { ListChecks } from "lucide-react";
import { CheckedMenuItem, Submenu } from "../ui/menu.js";

/** The status choices available from any item row menu. */
export function ItemStatusMenu({
  statuses,
  statusId,
  onChange,
}: {
  readonly statuses: readonly (typeof StatusProjection.Type)[];
  readonly statusId: string | null;
  readonly onChange: (statusId: string | null) => void;
}) {
  const choices = statuses.filter((status) => !status.isArchived || status.id === statusId);
  return (
    <Submenu label="Set status" icon={<ListChecks size={14} />} testId="item-menu-set-status">
      <CheckedMenuItem
        checked={statusId === null}
        onClick={() => onChange(null)}
        testId="item-status-none"
      >
        None
      </CheckedMenuItem>
      {choices.map((status) => (
        <CheckedMenuItem
          key={status.id}
          checked={status.id === statusId}
          onClick={() => onChange(status.id)}
          testId={`item-status-choice-${status.id}`}
        >
          {status.isArchived ? `${status.name} (archived)` : status.name}
        </CheckedMenuItem>
      ))}
    </Submenu>
  );
}
