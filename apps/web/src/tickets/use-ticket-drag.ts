import type { TicketPosition, TicketRow, TicketSection } from "@task-tracker/contracts";
import { type PointerEvent, type RefObject, useRef, useState } from "react";
import { useEdgeAutoScroll } from "../ui/use-edge-auto-scroll.js";
import { usePointerDrag } from "../ui/use-pointer-drag.js";
import { acceptsTicketDrop, headerPosition, rowPosition } from "./ticket-positions.js";

type Section = typeof TicketSection.Type;
type Row = typeof TicketRow.Type;
type Position = typeof TicketPosition.Type;

/** The attribute on a ticket row holding its item ID. */
export const TICKET_ROW_ATTRIBUTE = "data-ticket-id";

/** The attribute on a section header holding its priority ID, empty for No priority. */
export const TICKET_SECTION_ATTRIBUTE = "data-ticket-section";

/** Where a drop would land and the element that shows it. */
export interface TicketDropTarget {
  readonly position: Position;
  /** The hovered row's item ID, or null for a section header. */
  readonly rowId: string | null;
}

/** The ticket being dragged and its current drop target, if any. */
export interface TicketDragState {
  readonly draggedId: string;
  readonly target: TicketDropTarget | null;
}

const sectionKey = (priorityLevelId: string | null) => priorityLevelId ?? "";

const findRow = (sections: ReadonlyArray<Section>, id: string) =>
  sections.flatMap((section) => section.tickets).find((row) => row.itemId === id);

/** Reads the row or header under the pointer: row halves place before and after it. */
function hitTarget(
  sections: ReadonlyArray<Section>,
  list: HTMLElement,
  pointer: { readonly x: number; readonly y: number },
): TicketDropTarget | null {
  // Hit-testing respects scrolling and clipping, even while the source has capture.
  const hit = document.elementFromPoint(pointer.x, pointer.y);
  const rowElement = hit?.closest<HTMLElement>(`[${TICKET_ROW_ATTRIBUTE}]`);
  if (rowElement && list.contains(rowElement)) {
    const row = findRow(sections, rowElement.getAttribute(TICKET_ROW_ATTRIBUTE)!);
    const { top, height } = rowElement.getBoundingClientRect();
    return row === undefined
      ? null
      : { position: rowPosition(row, pointer.y >= top + height / 2), rowId: row.itemId };
  }
  const header = hit?.closest<HTMLElement>(`[${TICKET_SECTION_ATTRIBUTE}]`);
  const key =
    header && list.contains(header) ? header.getAttribute(TICKET_SECTION_ATTRIBUTE) : null;
  const section = sections.find((candidate) => sectionKey(candidate.priorityLevelId) === key);
  return section === undefined ? null : { position: headerPosition(section), rowId: null };
}

/** Options for {@link useTicketDrag}. */
export interface TicketDragOptions {
  /** The scrolling ticket list, which also bounds the drop targets. */
  readonly listRef: RefObject<HTMLElement | null>;
  readonly sections: ReadonlyArray<Section>;
  readonly onDrop: (row: Row, position: Position) => void;
}

/**
 * Pointer dragging of ticket rows with the shared gesture rules (§7.5, §7.16):
 * a left press becomes a drag at 4 pixels, and Escape or capture loss cancels
 * it. Holding the pointer near the list's top or bottom edge scrolls it, and
 * the drop target follows the rows that pass under the pointer.
 */
export function useTicketDrag(options: TicketDragOptions) {
  const [drag, setDrag] = useState<TicketDragState | null>(null);
  const start = usePointerDrag();
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<{ draggedId: string; x: number; y: number } | null>(null);

  const locate = (): TicketDropTarget | null => {
    const { listRef, sections } = latest.current;
    const current = gesture.current;
    const row = current === null ? undefined : findRow(sections, current.draggedId);
    if (current === null || row === undefined || listRef.current === null) {
      return null;
    }
    const target = hitTarget(sections, listRef.current, current);
    return target !== null && acceptsTicketDrop(sections, row, target.position) ? target : null;
  };

  const refresh = () => {
    const current = gesture.current;
    if (current !== null) {
      setDrag({ draggedId: current.draggedId, target: locate() });
    }
  };
  const autoScroll = useEdgeAutoScroll(options.listRef, refresh);

  const startDrag = (row: Row, event: PointerEvent<HTMLElement>) => {
    const follow = (pointer: MouseEvent) => {
      gesture.current = { draggedId: row.itemId, x: pointer.clientX, y: pointer.clientY };
    };
    start(event, {
      focusOnPress: true,
      move: (pointer) => {
        follow(pointer);
        refresh();
        autoScroll.update(pointer.clientY);
      },
      drop: (pointer) => {
        follow(pointer);
        const target = locate();
        const source = findRow(latest.current.sections, row.itemId);
        if (target !== null && source !== undefined) {
          latest.current.onDrop(source, target.position);
        }
      },
      end: () => {
        autoScroll.stop();
        gesture.current = null;
        setDrag(null);
      },
    });
  };

  return { drag, startDrag };
}
