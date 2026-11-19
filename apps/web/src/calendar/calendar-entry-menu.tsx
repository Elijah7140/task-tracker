import type {
  CalendarEntry,
  PriorityLevelProjection,
  StatusProjection,
} from "@task-tracker/contracts";
import { Flag } from "lucide-react";
import { createContext, useContext } from "react";
import { ContextMenuContent } from "../ui/menu.js";
import { ItemStatusMenu } from "../workspace/item-status-menu.js";
import { RowLookupMenu } from "../workspace/row-lookup-menu.js";

type Entry = typeof CalendarEntry.Type;

/** The lookups and commands behind every calendar entry's row menu. */
export interface CalendarEntryMenuActions {
  readonly statuses: ReadonlyArray<typeof StatusProjection.Type>;
  readonly priorityLevels: ReadonlyArray<typeof PriorityLevelProjection.Type>;
  readonly setStatus: (entry: Entry, statusId: string | null) => void;
  readonly setPriority: (entry: Entry, priorityLevelId: string | null) => void;
}

/** Calendar provides its entry menu commands here, so the grids need not pass them along. */
export const CalendarEntryMenuContext = createContext<CalendarEntryMenuActions | null>(null);

/** The row menu of one calendar entry: Set status and Set priority, as legacy CalendarView had. */
export function CalendarEntryMenu({ entry }: { readonly entry: Entry }) {
  const actions = useContext(CalendarEntryMenuContext);
  if (actions === null) {
    return null;
  }
  return (
    <ContextMenuContent testId="calendar-entry-menu">
      <ItemStatusMenu
        statuses={actions.statuses}
        statusId={entry.statusId}
        onChange={(statusId) => actions.setStatus(entry, statusId)}
      />
      <RowLookupMenu
        label="Set priority"
        icon={<Flag size={14} />}
        entries={actions.priorityLevels}
        currentId={entry.priorityLevelId}
        onSelect={(priorityLevelId) => actions.setPriority(entry, priorityLevelId)}
        testId="item-menu-set-priority"
      />
    </ContextMenuContent>
  );
}
