import { type PointerEvent, type RefObject, useRef, useState } from "react";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { usePointerDrag } from "../ui/use-pointer-drag.js";
import { type CardPlacement, mapCardDrop, mapCardDropToGroupEnd } from "./card-drop-mapper.js";
import {
  findItemNode,
  itemAncestorIds,
  type ItemNode,
  type ItemSiblings,
  siblingNodesOf,
} from "./item-outline.js";
import type { PriorityGroup } from "./priority-groups.js";
import { moveAmongVisible } from "./reorder-plan.js";

/** Drop positions along the item's flow axis (vertical for rows, horizontal for cards). */
export type ItemDropPosition = "before" | "after" | "into";

/** Workspace drop intent resolved against a row, card, priority header, area or root end. */
export type ItemDrop =
  | { readonly kind: "row"; readonly id: string; readonly position: ItemDropPosition }
  | { readonly kind: "card"; readonly placement: CardPlacement }
  | { readonly kind: "group"; readonly placement: CardPlacement }
  | { readonly kind: "area"; readonly folderId: string | null }
  | { readonly kind: "root-end" };

/** Current drag preview shown on item cards, rows and section headers. */
export interface ActiveItemDrag {
  readonly sourceId: string;
  readonly target: ItemDrop | null;
}

/** Options for {@link useItemDrag}. */
interface ItemDragOptions {
  readonly treeRef: RefObject<HTMLUListElement | null>;
  /** The open area, so a drop onto its own sidebar entry is ignored. */
  readonly folderId: string | null;
  /** The card level's snapshot the drop is validated against before it is sent. */
  readonly nodes: ItemSiblings;
  /** The drilled-in item whose children are the cards; null or absent for the top level. */
  readonly levelParentId?: string | null | undefined;
  /** The open priority sections in display order (§7.17). */
  readonly groups: ReadonlyArray<PriorityGroup>;
  readonly onDrop: (source: ItemNode, target: ItemDrop) => void;
}

/** Row and card controls that keep their own click and never start a drag. */
const NON_DRAG_CONTROLS =
  "button, input, textarea, [data-no-item-drag], [data-testid='completed-section-toggle']";

/**
 * Splits a target into thirds along its flow axis: first third inserts before,
 * middle third makes a sub-item and final third inserts after (§7.5, §7.17).
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

/** Resolves a nested sub-item row under the pointer along the vertical axis. */
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

/** The item whose children are the cards, or null for the area's top level (§7.19). */
const levelParent = (options: ItemDragOptions) => options.levelParentId ?? null;

/**
 * Whether a placement changes anything the user can see. An archived level cannot be assigned,
 * and a card dropped back into its own place in its section is left alone.
 */
function isUsefulPlacement(
  groups: ReadonlyArray<PriorityGroup>,
  source: ItemNode,
  placement: CardPlacement,
  levelParentId: string | null,
) {
  const group = groups.find((candidate) => candidate.priorityLevelId === placement.priorityLevelId);
  if (group === undefined) {
    return false;
  }
  const sameSection =
    source.item.parentItemId === levelParentId &&
    source.item.priorityLevelId === group.priorityLevelId;
  if (!sameSection) {
    return !group.isArchived;
  }
  const ids = group.cards.map((card) => card.item.id);
  const { targetId, position } = placement;
  return moveAmongVisible(ids, ids, source.item.id, targetId, position) !== null;
}

/**
 * Resolves a top-level card under the pointer along its width (§7.17): the side thirds place
 * the dragged item beside the card, in its section, and the middle third makes a sub-item.
 */
function cardTarget(
  options: ItemDragOptions,
  source: ItemNode,
  card: HTMLElement,
  clientX: number,
): ItemDrop | null {
  const { nodes, groups } = options;
  const id = card.dataset["itemRowId"]!;
  if (findItemNode(nodes, id) === undefined || id === source.item.id) {
    return null;
  }
  const { left, width } = card.getBoundingClientRect();
  const position = positionAcross(clientX - left, width);
  if (position === "into") {
    return { kind: "row", id, position };
  }
  const placement = mapCardDrop(nodes, groups, source.item.id, id, position);
  return placement !== null && isUsefulPlacement(groups, source, placement, levelParent(options))
    ? { kind: "card", placement }
    : null;
}

/** Resolves a priority section header under the pointer: the item joins the end of it (§7.17). */
function groupHeaderTarget(
  options: ItemDragOptions,
  source: ItemNode,
  header: HTMLElement,
): ItemDrop | null {
  const { nodes, groups } = options;
  const key = header.dataset["priorityGroupId"] ?? "";
  const group = groups.find((candidate) => (candidate.priorityLevelId ?? "") === key);
  const placement =
    group === undefined ? null : mapCardDropToGroupEnd(nodes, source.item.id, group);
  return placement !== null && isUsefulPlacement(groups, source, placement, levelParent(options))
    ? { kind: "group", placement }
    : null;
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
    return row.dataset["itemCard"] === "true"
      ? cardTarget(options, source, row, event.clientX)
      : rowTarget(options.nodes, source, row, event.clientY);
  }
  const header = hit?.closest<HTMLElement>("[data-priority-group-id]");
  if (header && tree.contains(header)) {
    return groupHeaderTarget(options, source, header);
  }
  const area = hit?.closest<HTMLElement>("[data-item-drop-area]");
  if (area) {
    return areaTarget(options, source, area);
  }
  const promotes =
    source.item.parentItemId !== levelParent(options) && isBelowTree(tree, hit, event.clientY);
  return promotes ? { kind: "root-end" } : null;
}

/**
 * Translates the shared pointer gesture into workspace drop intents (§7.5, §7.17). A
 * left press on a card or row becomes a drag at 4 pixels; Escape or capture loss
 * cancels it, and another button press leaves the original source active.
 */
export function useItemDrag(options: ItemDragOptions) {
  const [dragState, setDragState] = useState<ActiveItemDrag | null>(null);
  const start = usePointerDrag();
  const latest = useRef(options);
  latest.current = options;
  const setItemDropArea = useWorkspaceStore((state) => state.setItemDropArea);

  const startDrag = (node: ItemNode, event: PointerEvent<HTMLElement>) => {
    const target = event.target as Element;
    if (target.closest("[data-item-row-id]") !== event.currentTarget) {
      return;
    }
    if (target.closest(NON_DRAG_CONTROLS)) {
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
