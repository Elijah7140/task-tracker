import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ItemNode } from "./item-outline.js";
import { type DropPlacement, resolveDropTarget, type SiblingRowRect } from "./reorder-plan.js";

/** Minimum vertical pointer travel in CSS pixels before a drag starts. */
const DRAG_THRESHOLD_PX = 4;

/** Current sibling drag preview shown on the tree rows. */
export interface ActiveItemDrag {
  readonly sourceId: string;
  readonly parentItemId: string | null;
  readonly targetId: string | null;
  readonly placement: DropPlacement | null;
}

/** Options for {@link useItemDrag}. */
export interface UseItemDragOptions {
  readonly treeRef: RefObject<HTMLUListElement | null>;
  readonly onDrop: (
    parentItemId: string | null,
    sourceId: string,
    targetId: string,
    placement: DropPlacement,
  ) => void;
}

function collectSiblingRects(
  tree: HTMLUListElement | null,
  parentItemId: string | null,
): ReadonlyArray<SiblingRowRect> {
  if (tree === null) {
    return [];
  }
  const key = parentItemId ?? "root";
  const rows = tree.querySelectorAll<HTMLElement>(`[data-drag-parent="${key}"]`);
  const rects: Array<SiblingRowRect> = [];
  for (const row of rows) {
    const id = row.dataset["itemRowId"];
    if (id !== undefined) {
      const { top, height } = row.getBoundingClientRect();
      rects.push({ id, top, height });
    }
  }
  return rects;
}

interface DragSessionInput {
  readonly sourceId: string;
  readonly parentItemId: string | null;
  readonly originY: number;
  readonly treeRef: RefObject<HTMLUListElement | null>;
  readonly setDragState: (next: ActiveItemDrag | null) => void;
  readonly onComplete: (drop: ReturnType<typeof resolveDropTarget>) => void;
}

function beginDragSession({
  sourceId,
  parentItemId,
  originY,
  treeRef,
  setDragState,
  onComplete,
}: DragSessionInput): () => void {
  let active = false;
  let latestTarget: ReturnType<typeof resolveDropTarget> = null;

  const updateTarget = (clientY: number) => {
    if (!active && Math.abs(clientY - originY) < DRAG_THRESHOLD_PX) {
      return;
    }
    active = true;
    latestTarget = resolveDropTarget(
      collectSiblingRects(treeRef.current, parentItemId),
      sourceId,
      clientY,
    );
    setDragState({
      sourceId,
      parentItemId,
      targetId: latestTarget?.targetId ?? null,
      placement: latestTarget?.placement ?? null,
    });
  };

  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKeyDown);
    setDragState(null);
  };

  const onMove = (event: PointerEvent) => updateTarget(event.clientY);
  const onUp = (event: PointerEvent) => {
    updateTarget(event.clientY);
    const drop = active ? latestTarget : null;
    cleanup();
    onComplete(drop);
  };
  const onCancel = () => cleanup();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKeyDown);
  return cleanup;
}

/**
 * Pointer-based sibling reorder hook. Tracks movement on `window` once the
 * pointer crosses {@link DRAG_THRESHOLD_PX}, resolves the drop target among
 * open siblings sharing `parentItemId`, and cancels cleanly on Escape or unmount.
 */
export function useItemDrag({ treeRef, onDrop }: UseItemDragOptions) {
  const [dragState, setDragState] = useState<ActiveItemDrag | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => () => cleanupRef.current?.(), []);

  const startDrag = (node: ItemNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || node.isFinished) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cleanupRef.current?.();
    const { id: sourceId, parentItemId } = node.item;
    cleanupRef.current = beginDragSession({
      sourceId,
      parentItemId,
      originY: event.clientY,
      treeRef,
      setDragState,
      onComplete: (drop) => {
        cleanupRef.current = null;
        if (drop !== null) {
          onDropRef.current(parentItemId, sourceId, drop.targetId, drop.placement);
        }
      },
    });
  };

  return { dragState, startDrag };
}
