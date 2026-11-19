import { ContextMenu } from "@base-ui/react/context-menu";
import type { TodayRow as Row } from "@task-tracker/contracts";
import { ChevronRight, Circle } from "lucide-react";
import type { HTMLAttributes, KeyboardEvent } from "react";
import { cx } from "../ui/class-names.js";
import { isContextMenuKey, matchesShortcut } from "../ui/keyboard-shortcut.js";
import { openContextMenuAt } from "../ui/open-context-menu.js";
import { treeStyles } from "../ui/tree-styles.js";
import { CompletionMark } from "../workspace/item-parts.js";
import { ItemStatusChip } from "../workspace/item-status-chip.js";
import { PUSH_BACK_SHORTCUT, pushBackReason } from "../workspace/push-back-availability.js";
import { TodayRowMenu, todayPushBackState } from "./today-row-menu.js";
import type { TodayActions } from "./use-today-actions.js";

/** Expansion of the Today rows, from {@link useTodayExpansion}. */
export interface TodayExpansion {
  readonly isExpanded: (row: Row) => boolean;
  readonly setExpanded: (row: Row, expanded: boolean) => void;
}

/** Props for {@link TodayRow}. */
export interface TodayRowProps {
  readonly row: Row;
  readonly actions: TodayActions;
  readonly expansion: TodayExpansion;
}

const STATE_LABELS: Readonly<Record<Row["state"], string | null>> = {
  open: "Not completed",
  completedEarlier: "Completed earlier",
  completedToday: null,
};

function ExpandToggle({ row, expansion }: Omit<TodayRowProps, "actions">) {
  if (row.children.length === 0) {
    return <span className="size-5 shrink-0" aria-hidden="true" />;
  }
  const expanded = expansion.isExpanded(row);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Sub-items of ${row.title}`}
      aria-expanded={expanded}
      data-testid="today-expand"
      onClick={() => expansion.setExpanded(row, !expanded)}
      className={cx(treeStyles.chevron, expanded && "rotate-90")}
    >
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

/** Reopens a completed row. An open context row shows a muted open circle instead (§7.14). */
function RowMark({ row, actions }: Pick<TodayRowProps, "row" | "actions">) {
  if (row.state === "open") {
    return (
      <span
        aria-hidden="true"
        data-testid="today-open-mark"
        className="grid size-5 shrink-0 place-items-center text-fg-subtle"
      >
        <Circle size={16} strokeWidth={1.75} />
      </span>
    );
  }
  return <CompletionMark title={row.title} completed onToggle={() => actions.reopen(row)} />;
}

/**
 * The title's keys: the Menu key and Shift+F10 open the row menu (§8),
 * Ctrl+Shift+P pushes back the focused row's item (§7.14), and the right and
 * left arrows expand and collapse it.
 */
function titleKeyHandler({ row, actions, expansion }: TodayRowProps) {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isContextMenuKey(event)) {
      event.preventDefault();
      openContextMenuAt(event.currentTarget);
    } else if (matchesShortcut(event, PUSH_BACK_SHORTCUT)) {
      event.preventDefault();
      if (!event.repeat && pushBackReason(todayPushBackState(row)) === null) {
        actions.pushBack(row);
      }
    } else if (
      row.children.length > 0 &&
      (event.key === "ArrowRight" || event.key === "ArrowLeft")
    ) {
      event.preventDefault();
      expansion.setExpanded(row, event.key === "ArrowRight");
    }
  };
}

function RowDetails({ row }: { readonly row: Row }) {
  const stateLabel = STATE_LABELS[row.state];
  const showCount = row.children.length > 0 && row.state !== "open";
  return (
    <>
      {stateLabel === null ? null : (
        <span data-testid="today-row-state" className="shrink-0 text-xs text-fg-subtle">
          {stateLabel}
        </span>
      )}
      <ItemStatusChip name={row.statusName ?? undefined} />
      {showCount ? (
        <span
          data-testid="today-child-count"
          className="shrink-0 text-xs text-fg-muted tabular-nums"
        >
          {row.completedDescendants} completed
        </span>
      ) : null}
    </>
  );
}

function RowLine(props: TodayRowProps & { readonly triggerProps: HTMLAttributes<HTMLElement> }) {
  const { row, actions, expansion, triggerProps } = props;
  return (
    <div
      {...triggerProps}
      data-testid="today-item-row"
      data-item-id={row.itemId}
      data-state={row.state}
      className="flex min-h-8 min-w-0 items-center gap-1 rounded-control px-1 transition-colors hover:bg-hover"
    >
      <ExpandToggle row={row} expansion={expansion} />
      <RowMark row={row} actions={actions} />
      <button
        type="button"
        data-testid="today-item-title"
        onClick={() => actions.open(row)}
        onKeyDown={titleKeyHandler(props)}
        aria-keyshortcuts="Control+Shift+P"
        className={cx(
          "min-w-0 truncate rounded-[0.3125rem] px-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus",
          row.state === "open" ? "text-fg-muted" : "text-fg",
        )}
      >
        {row.title}
      </button>
      <RowDetails row={row} />
    </div>
  );
}

/**
 * One row of a Today tree and its expanded children (§7.14). Clicking the
 * title opens the item, the circle reopens a completed item, and right-click
 * opens the row menu.
 */
export function TodayRow(props: TodayRowProps) {
  const { row, actions, expansion } = props;
  const expanded = expansion.isExpanded(row);
  return (
    <li>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={(triggerProps: HTMLAttributes<HTMLElement>) => (
            <RowLine {...props} triggerProps={triggerProps} />
          )}
        />
        <TodayRowMenu row={row} actions={actions} />
      </ContextMenu.Root>
      {expanded && row.children.length > 0 ? (
        <ul className="flex flex-col gap-px pl-6">
          {row.children.map((child) => (
            <TodayRow key={child.itemId} row={child} actions={actions} expansion={expansion} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
