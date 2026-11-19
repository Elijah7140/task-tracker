import type { TicketRow as TicketRowRecord, TicketSection } from "@task-tracker/contracts";
import { useId } from "react";
import { cx } from "../ui/class-names.js";
import { TicketRow, type TicketRowProps } from "./ticket-row.js";
import { TICKET_SECTION_ATTRIBUTE, type TicketDragState } from "./use-ticket-drag.js";

type Section = typeof TicketSection.Type;
type Row = typeof TicketRowRecord.Type;

/** Props for {@link TicketSectionList}. */
export interface TicketSectionListProps extends Pick<
  TicketRowProps,
  "actions" | "onKeyDown" | "onPointerDown" | "onFocus"
> {
  readonly section: Section;
  readonly drag: TicketDragState | null;
  readonly tabIndexFor: (row: Row) => 0 | -1;
}

function rowView(row: Row, drag: TicketDragState | null) {
  const target = drag?.target;
  const drop = target?.rowId === row.itemId ? (target.position.after ? "after" : "before") : null;
  return { dragging: drag?.draggedId === row.itemId, drop } as const;
}

function headerDrop(section: Section, drag: TicketDragState | null) {
  const target = drag?.target;
  const onHeader =
    target !== undefined &&
    target !== null &&
    target.rowId === null &&
    target.position.priorityLevelId === section.priorityLevelId;
  return onHeader ? "after" : undefined;
}

/**
 * A priority section: its header, which takes drops at the section start, and
 * its visible tickets in rank order (§7.16).
 */
export function TicketSectionList({
  section,
  drag,
  tabIndexFor,
  ...rowProps
}: TicketSectionListProps) {
  const headingId = useId();
  const drop = headerDrop(section, drag);
  return (
    <section
      aria-label={section.label}
      data-testid="ticket-section"
      className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
    >
      <div
        {...{ [TICKET_SECTION_ATTRIBUTE]: section.priorityLevelId ?? "" }}
        data-testid="ticket-section-header"
        data-drop={drop}
        className={cx(
          "relative flex h-9 items-center gap-2 bg-sidebar px-3",
          drop === undefined
            ? null
            : "after:pointer-events-none after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-full after:bg-accent",
        )}
      >
        <h2 id={headingId} className="text-[13px] font-semibold text-fg">
          {section.label}
        </h2>
        {section.isArchived ? <span className="text-xs text-fg-subtle">Archived</span> : null}
      </div>
      <ul
        aria-labelledby={headingId}
        className="flex flex-col divide-y divide-line border-line not-empty:border-t"
      >
        {section.tickets.map((row) => (
          <TicketRow
            key={row.itemId}
            row={row}
            tabIndex={tabIndexFor(row)}
            view={rowView(row, drag)}
            {...rowProps}
          />
        ))}
      </ul>
    </section>
  );
}
