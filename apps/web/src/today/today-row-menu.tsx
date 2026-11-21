import type { TodayRow } from "@task-tracker/contracts";
import { Flag, SquareArrowOutUpRight } from "lucide-react";
import { ContextMenuContent, MenuItem } from "../ui/menu.js";
import { ItemStatusMenu } from "../workspace/item-status-menu.js";
import { PushBackMenuItem } from "../workspace/push-back-menu-item.js";
import { RowLookupMenu } from "../workspace/row-lookup-menu.js";
import type { TodayActions } from "./use-today-actions.js";

type Row = typeof TodayRow.Type;

/** What decides whether a Today row's item can be pushed back (§7.14). */
export const todayPushBackState = (row: Row) => ({
  isCompleted: row.state !== "open",
  hasDates: row.hasDates,
});

/**
 * A Today row's menu: Open, Set status, Set priority and Push back one day (§7.14).
 */
export function TodayRowMenu({
  row,
  actions,
}: {
  readonly row: Row;
  readonly actions: TodayActions;
}) {
  return (
    <ContextMenuContent testId="today-row-menu">
      <MenuItem
        icon={<SquareArrowOutUpRight size={14} />}
        onClick={() => actions.open(row)}
        testId="today-menu-open"
      >
        Open
      </MenuItem>
      <ItemStatusMenu
        statuses={actions.statuses}
        statusId={row.statusId}
        onChange={(statusId) => actions.setStatus(row, statusId)}
      />
      <RowLookupMenu
        label="Set priority"
        icon={<Flag size={14} />}
        entries={actions.priorityLevels}
        currentId={row.priorityLevelId}
        onSelect={(priorityLevelId) => actions.setPriority(row, priorityLevelId)}
        testId="item-menu-set-priority"
      />
      <PushBackMenuItem state={todayPushBackState(row)} onPushBack={() => actions.pushBack(row)} />
    </ContextMenuContent>
  );
}
