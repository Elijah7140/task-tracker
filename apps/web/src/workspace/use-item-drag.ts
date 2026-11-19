import { type PointerEvent, type RefObject, useRef, useState } from "react";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { usePointerDrag } from "../ui/use-pointer-drag.js";
import {
  findItemNode,
  itemAncestorIds,
  type ItemNode,
  type ItemSiblings,
  siblingNodesOf,
} from "./item-outline.js";
import { moveAmongVisible } from "./reorder-plan.js";

/** Row drop positions along the tree's vertical axis. */
export type ItemDropPosition = "before" | "after" | "into";

/** Workspace drop intent resolved against a visible row, area or the end of the tree. */
export type ItemDrop =
  | { readonly kind: "row"; readonly id: string; readonly position: ItemDropPosition }
  | { readonly kind: "area"; readonly folderId: string | null }
  | { readonly kind: "root-end" };

/** Current drag preview shown on item rows. */
export interface ActiveItemDrag {
  readonly sourceId: string;
  readonly target: ItemDrop | null;
}

/** Options for {@link useItemDrag}. */
interface ItemDragOptions {
  readonly treeRef: RefObject<HTMLUListElement | null>;
  /** The open area, so a drop onto its own sidebar entry is ignored. */
  readonly folderId: string | null;
  /** The area snapshot the drop is validated against before it is sent. */
  readonly nodes: ItemSiblings;
  readonly onDrop: (source: ItemNode, target: ItemDrop) => void;
}

/** Row controls that keep their own click and never start a drag. */
const NON_DRAG_CONTROLS =
  "button:not([data-testid='item-drag-handle']), [data-testid='item-toggle']";

/**
 * Splits a row into thirds along the direction items flow: the top third
 * inserts before, the middle third makes a sub-item and the bottom third
 * inserts after (§7.5).
 */
function positionAcross(offset: number, length: number): ItemDropPosition {
  if (offset < length / 3) {
    return "before";
  }
  return offset > (length * 2) / 3 ? "after" : "into";
}

/** True when an edge drop among the same open siblings would leave their order unchanged. */
function isUnchangedOrder(
  nodes: ItemSiblings,
  source: ItemNode,
  targetId: string,
  position: "before" | "after",
) {
  const open = siblingNodesOf(nodes, source.item.parentItemId).open.map(({ item }) => item.id);
  return moveAmongVisible(open, open, source.item.id, targetId, position) === null;
}

/**
 * Resolves a row under the pointer. Self and descendant targets are rejected,
 * and so are insertion edges involving a finished row, which is ordered by
 * completion time rather than by drag (§6.2).
 */
function rowTarget(nodes: ItemSiblings, source: ItemNode, row: HTMLElement, clientY: number) {
  const id = row.dataset["itemRowId"]!;
  const target = findItemNode(nodes, id);
  if (!target || id === source.item.id || itemAncestorIds(nodes, id).includes(source.item.id)) {
    return null;
  }
  const { top, height } = row.getBoundingClientRect();
  const position = positionAcross(clientY - top, height);
  if (position === "into") {
    return { kind: "row", id, position } as const;
  }
  if (source.isFinished || target.isFinished) {
    return null;
  }
  const sameParent = source.item.parentItemId === target.item.parentItemId;
  return sameParent && isUnchangedOrder(nodes, source, id, position)
    ? null
    : ({ kind: "row", id, position } as const);
}

/** A sidebar area under the pointer accepts top-level items from another area. */
function areaTarget(
  options: ItemDragOptions,
  source: ItemNode,
  area: HTMLElement,
): ItemDrop | null {
  if (source.item.parentItemId !== null) {
    return null;
  }
  const folderId = area.dataset["itemDropArea"] || null;
  return folderId === options.folderId ? null : { kind: "area", folderId };
}

/** Empty workspace below the tree promotes a sub-item to the end of the top level. */
function isBelowTree(tree: HTMLElement, hit: Element | null, clientY: number) {
  return (
    hit?.closest("main") === tree.closest("main") && clientY >= tree.getBoundingClientRect().bottom
  );
}

function targetAt(options: ItemDragOptions, source: ItemNode, event: MouseEvent): ItemDrop | null {
  const tree = options.treeRef.current;
  if (tree === null) {
    return null;
  }
  // Hit-testing respects the scroll viewport and clipping, even while the source has capture.
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const row = hit?.closest<HTMLElement>("[data-item-row-id]");
  if (row && tree.contains(row)) {
    return rowTarget(options.nodes, source, row, event.clientY);
  }
  const area = hit?.closest<HTMLElement>("[data-item-drop-area]");
  if (area) {
    return areaTarget(options, source, area);
  }
  const promotes = source.item.parentItemId !== null && isBelowTree(tree, hit, event.clientY);
  return promotes ? { kind: "root-end" } : null;
}

/**
 * Translates the shared pointer gesture into workspace drop intents (§7.5). A
 * left press on a row becomes a drag at 4 pixels; Escape or capture loss
 * cancels it, and another button press leaves the original source active.
 * The latest snapshot validates each target, the
 * server validates the drop again, and the hovered sidebar area is published
 * for its highlight.
 */
export function useItemDrag(options: ItemDragOptions) {
  const [dragState, setDragState] = useState<ActiveItemDrag | null>(null);
  const start = usePointerDrag();
  const latest = useRef(options);
  latest.current = options;
  const setItemDropArea = useWorkspaceStore((state) => state.setItemDropArea);

  const startDrag = (node: ItemNode, event: PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest(NON_DRAG_CONTROLS)) {
      return;
    }
    const sourceId = node.item.id;
    const locate = (pointer: MouseEvent) => {
      const source = findItemNode(latest.current.nodes, sourceId);
      return source === undefined
        ? null
        : { source, target: targetAt(latest.current, source, pointer) };
    };
    start(event, {
      focusOnPress: true,
      move: (pointer) => {
        const target = locate(pointer)?.target ?? null;
        setDragState({ sourceId, target });
        setItemDropArea(target?.kind === "area" ? { folderId: target.folderId } : null);
      },
      drop: (pointer) => {
        const result = locate(pointer);
        if (result?.target) {
          latest.current.onDrop(result.source, result.target);
        }
      },
      end: () => {
        setDragState(null);
        setItemDropArea(null);
      },
    });
  };

  return { dragState, startDrag };
}
