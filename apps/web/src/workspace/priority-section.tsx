import type { ReactNode } from "react";
import { cx } from "../ui/class-names.js";
import { CardGrid } from "./card-grid.js";
import type { PriorityGroup } from "./priority-groups.js";

/** Props for {@link PrioritySection}. */
export interface PrioritySectionProps {
  readonly group: PriorityGroup;
  readonly preferredColumns: number;
  readonly minRowHeight: number;
  readonly isDropTarget: boolean;
  readonly children: ReactNode;
}

/**
 * One priority section of the workspace card grid: a droppable header showing
 * the priority title, archived badge when applicable, and item count, followed
 * by its responsive card grid (§7.17).
 */
export function PrioritySection({
  group,
  preferredColumns,
  minRowHeight,
  isDropTarget,
  children,
}: PrioritySectionProps) {
  const headingId = `priority-section-${group.priorityLevelId ?? "none"}`;
  return (
    <li role="none" data-testid="priority-section" className="flex flex-col gap-2">
      <div
        data-testid="priority-group-header"
        data-priority-group-id={group.priorityLevelId ?? ""}
        data-priority-archived={group.isArchived ? "true" : undefined}
        data-drop-target={isDropTarget ? "true" : undefined}
        className={cx(
          "relative flex items-center gap-2 rounded-control px-2 py-1 transition-colors",
          isDropTarget && "bg-accent-soft ring-1 ring-accent",
        )}
      >
        <h2 id={headingId} className="text-[15px] font-semibold text-fg">
          {group.title}
        </h2>
        {group.isArchived ? (
          <span
            data-testid="priority-group-archived"
            className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium text-fg-muted"
          >
            Archived
          </span>
        ) : null}
        <span data-testid="priority-group-count" className="text-xs text-fg-subtle">
          {group.countLabel}
        </span>
        {isDropTarget ? (
          <span
            aria-hidden="true"
            data-testid="drop-indicator"
            data-placement="group-end"
            className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[11px] leading-4 font-medium text-on-accent"
          >
            Append to {group.title}
          </span>
        ) : null}
      </div>
      <CardGrid
        preferredColumns={preferredColumns}
        minRowHeight={minRowHeight}
        labelledBy={headingId}
      >
        {children}
      </CardGrid>
    </li>
  );
}
