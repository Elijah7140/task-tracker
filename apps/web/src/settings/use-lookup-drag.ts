import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useState } from "react";

/** The row being dragged and the row under the pointer. */
export interface LookupDragState {
  readonly draggedId: string;
  readonly overId: string | null;
}

/** The row under `clientY`, or the nearest row when the pointer is between or past rows. */
function findRowIdAtY(list: HTMLUListElement | null, clientY: number): string | null {
  const elements = list?.querySelectorAll<HTMLElement>("[data-lookup-row-id]") ?? [];
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const id = element.dataset["lookupRowId"] ?? null;
    if (id === null) {
      continue;
    }
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return id;
    }
    const distance = Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = id;
    }
  }
  return nearestId;
}

/** Tracks the hovered row while dragging and reports a drop on another row. */
function useDragListeners(
  listRef: RefObject<HTMLUListElement | null>,
  dragState: LookupDragState | null,
  setDragState: (update: (current: LookupDragState | null) => LookupDragState | null) => void,
  onDrop: (draggedId: string, targetId: string) => void,
) {
  useEffect(() => {
    if (dragState === null) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      const overId = findRowIdAtY(listRef.current, event.clientY);
      setDragState((current) => (current === null ? null : { ...current, overId }));
    };
    const handleUp = (event: PointerEvent) => {
      const targetId = findRowIdAtY(listRef.current, event.clientY);
      setDragState(() => null);
      if (targetId !== null && targetId !== dragState.draggedId) {
        onDrop(dragState.draggedId, targetId);
      }
    };
    const handleCancel = () => setDragState(() => null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [listRef, dragState, setDragState, onDrop]);
}

/**
 * Pointer-drag reordering for a lookup list. Rows carry `data-lookup-row-id`;
 * releasing over another row calls `onDrop` with both IDs.
 */
export function useLookupDrag(
  listRef: RefObject<HTMLUListElement | null>,
  onDrop: (draggedId: string, targetId: string) => void,
) {
  const [dragState, setDragState] = useState<LookupDragState | null>(null);
  useDragListeners(listRef, dragState, setDragState, onDrop);

  const startDrag = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragState({ draggedId: id, overId: id });
  };

  return { dragState, startDrag };
}
