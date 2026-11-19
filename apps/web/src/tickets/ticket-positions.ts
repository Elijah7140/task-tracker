import type { TicketPosition, TicketRow, TicketSection } from "@task-tracker/contracts";

type Section = typeof TicketSection.Type;
type Row = typeof TicketRow.Type;
type Position = typeof TicketPosition.Type;

/** Before or after a visible row, in that row's section. */
export function rowPosition(row: Row, after: boolean): Position {
  return { priorityLevelId: row.priorityLevelId, anchorId: row.itemId, after };
}

/** The start of a section, as a drop on its header places a ticket (§7.16). */
export function headerPosition(section: Section): Position {
  return { priorityLevelId: section.priorityLevelId, anchorId: null, after: false };
}

const sameSection = (section: Section, priorityLevelId: string | null) =>
  section.priorityLevelId === priorityLevelId;

/**
 * Whether a drop target accepts the dragged ticket: never the ticket itself,
 * and only its own section or a section that takes new tickets. An archived
 * level keeps its tickets but takes no new ones.
 */
export function acceptsTicketDrop(
  sections: ReadonlyArray<Section>,
  row: Row,
  position: Position,
): boolean {
  if (position.anchorId === row.itemId) {
    return false;
  }
  if (row.priorityLevelId === position.priorityLevelId) {
    return true;
  }
  const target = sections.find((section) => sameSection(section, position.priorityLevelId));
  return target !== undefined && !target.isArchived;
}

/** Enters the nearest assignable section in `direction`, next to its closest visible row. */
function crossIntoSection(sections: ReadonlyArray<Section>, from: number, direction: -1 | 1) {
  for (let index = from + direction; index >= 0 && index < sections.length; index += direction) {
    const next = sections[index]!;
    if (next.isArchived) {
      continue;
    }
    const anchor = direction === 1 ? next.tickets[0] : next.tickets.at(-1);
    const after = direction === -1;
    return { priorityLevelId: next.priorityLevelId, anchorId: anchor?.itemId ?? null, after };
  }
  return null;
}

/**
 * The position Alt+Up (`-1`) or Alt+Down (`1`) moves a ticket to: past the
 * neighbouring visible row, or across the section boundary into the next
 * assignable section, which changes its priority (§7.16). Null at the ends.
 */
export function keyboardStepPosition(
  sections: ReadonlyArray<Section>,
  itemId: string,
  direction: -1 | 1,
): Position | null {
  const sectionIndex = sections.findIndex((section) =>
    section.tickets.some((ticket) => ticket.itemId === itemId),
  );
  const section = sections[sectionIndex];
  if (section === undefined) {
    return null;
  }
  const index = section.tickets.findIndex((ticket) => ticket.itemId === itemId);
  const neighbour = section.tickets[index + direction];
  return neighbour === undefined
    ? crossIntoSection(sections, sectionIndex, direction)
    : rowPosition(neighbour, direction === 1);
}
