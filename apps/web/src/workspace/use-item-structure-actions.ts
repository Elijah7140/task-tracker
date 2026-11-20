import { useAtomSet } from "@effect/atom-react";
import type { PriorityLevelProjection } from "@task-tracker/contracts";
import { useNavigate } from "@tanstack/react-router";
import type { Exit } from "effect";
import { reportFailure } from "../dialogs/report-failure.js";
import { areaKey } from "../rpc/area-queries.js";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import {
  indentItemAtom,
  moveItemAtom,
  moveItemToAreaAtom,
  outdentItemAtom,
  reorderItemsAtom,
} from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { choose } from "../state/dialog-store.js";
import { carryItemEditor, useItemEditorStore } from "../state/item-editor-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { useSerialReorder } from "../ui/use-serial-reorder.js";
import { areaTarget } from "./area-route.js";
import { keepsSection, stepCard } from "./card-drop-mapper.js";
import { areaChoiceOptions, type Folder, ROOT_AREA_CHOICE } from "./folder-outline.js";
import {
  departureFocusIds,
  findItemNode,
  flattenItemNodes,
  itemAncestorIds,
  type ItemFocusRequest,
  type ItemNode,
  type ItemSiblings,
  persistedSiblingOrder,
  precedingOpenSibling,
  sameGroupSiblingIds,
  siblingNodesOf,
} from "./item-outline.js";
import { buildPriorityGroups } from "./priority-groups.js";
import { swapWithVisibleNeighbor } from "./reorder-plan.js";
import { useSaveCardMove } from "./use-card-move.js";
import { type MoveResult, useItemMoveRunner } from "./use-item-move-runner.js";

const TOP_LEVEL_CHOICE = "top-level";

/** Context needed by item hierarchy and order mutations. */
export interface ItemStructureScope {
  readonly projectId: string;
  readonly projectName: string;
  readonly folderId: string | null;
  readonly areaName: string;
  readonly folders: ReadonlyArray<Folder>;
  readonly items: ItemSiblings;
  readonly priorityLevels: ReadonlyArray<typeof PriorityLevelProjection.Type>;
  readonly onFocusItem: (request: ItemFocusRequest) => void;
  /** Shows or clears the inline failure of a pointer drop in this area. */
  readonly onMoveError: (message: string | null) => void;
}

/** Shows a failed item action dialog and reports whether the exit succeeded. */
export function reportItemFailure(exit: Exit.Exit<unknown, RpcFailure>): Promise<boolean> {
  return reportFailure("Item action failed", exit);
}

function expandBranch(items: ItemSiblings, parentItemId: string) {
  const { setItemExpanded } = useWorkspaceStore.getState();
  for (const ancestorId of itemAncestorIds(items, parentItemId)) {
    setItemExpanded(ancestorId, true);
  }
  setItemExpanded(parentItemId, true);
}

/**
 * Clears the selection of an item that left the area's open list and asks for
 * focus on a neighbouring row, its parent or quick-add (§8).
 */
export function focusAfterDeparture(scope: ItemStructureScope, node: ItemNode) {
  const store = useWorkspaceStore.getState();
  if (store.selectedItemId === node.item.id) {
    store.selectItem(null);
  }
  scope.onFocusItem({
    id: node.item.id,
    afterNodes: scope.items,
    fallbackIds: departureFocusIds(scope.items, node),
  });
}

/**
 * Reveals and selects an item moved under `parentItemId` in this area, and
 * focuses its row once the refreshed tree shows it, unless something newer
 * took precedence while the move saved.
 */
export function showMovedItem(
  scope: ItemStructureScope,
  node: ItemNode,
  parentItemId: string | null,
  result: MoveResult,
) {
  if (!result.follow) {
    return;
  }
  const store = useWorkspaceStore.getState();
  if (parentItemId !== null) {
    expandBranch(scope.items, parentItemId);
  }
  if (node.isFinished) {
    // A finished item lands in its new level's Completed section.
    store.setCompletedExpanded(parentItemId ?? areaKey(scope.projectId, scope.folderId), true);
  }
  store.selectItem(node.item.id);
  if (result.focusRow) {
    scope.onFocusItem({
      id: node.item.id,
      expectedParentId: parentItemId,
      afterNodes: scope.items,
    });
  }
}

/** Opens the area a top-level item moved to, carrying its editor and row focus along. */
function useShowAreaMove(scope: ItemStructureScope) {
  const navigate = useNavigate();
  return async (node: ItemNode, targetFolderId: string | null, result: MoveResult) => {
    if (!result.follow) {
      return;
    }
    const targetKey = areaKey(scope.projectId, targetFolderId);
    if (useItemEditorStore.getState().openItemId === node.item.id) {
      carryItemEditor({ itemId: node.item.id, areaKey: targetKey });
    }
    const store = useWorkspaceStore.getState();
    store.selectItem(node.item.id);
    store.setPendingRowFocus(result.focusRow ? { itemId: node.item.id, areaKey: targetKey } : null);
    await navigate(areaTarget(scope.projectId, targetFolderId));
  };
}

/** Moves a top-level item to another area of the project and follows it there. */
export function useMoveToArea(scope: ItemStructureScope) {
  const moveToArea = useAtomSet(moveItemToAreaAtom, { mode: "promiseExit" });
  const showAreaMove = useShowAreaMove(scope);
  return (node: ItemNode, targetFolderId: string | null) =>
    moveToArea({
      payload: {
        projectId: scope.projectId,
        sourceFolderId: scope.folderId,
        targetFolderId,
        itemId: node.item.id,
      },
      reactivityKeys: [
        HISTORY_KEY,
        PROJECTS_KEY,
        areaKey(scope.projectId, scope.folderId),
        areaKey(scope.projectId, targetFolderId),
      ],
    }).then((exit) => ({
      exit,
      show: (result: MoveResult) => showAreaMove(node, targetFolderId, result),
    }));
}

function useIndentAndOutdent(scope: ItemStructureScope) {
  const indent = useAtomSet(indentItemAtom, { mode: "promiseExit" });
  const outdent = useAtomSet(outdentItemAtom, { mode: "promiseExit" });
  const move = useAtomSet(moveItemAtom, { mode: "promiseExit" });
  const run = useItemMoveRunner();
  const structureKeys = [areaKey(scope.projectId, scope.folderId), PROJECTS_KEY, HISTORY_KEY];
  const area = { projectId: scope.projectId, folderId: scope.folderId };

  /** Indents with IndentItem when the target is the adjacent sibling, else reparents under it. */
  const saveIndent = (node: ItemNode, targetParent: ItemNode) => {
    const siblingIds = persistedSiblingOrder(siblingNodesOf(scope.items, node.item.parentItemId));
    const index = siblingIds.indexOf(node.item.id);
    const adjacent = index > 0 && siblingIds[index - 1] === targetParent.item.id;
    const itemId = node.item.id;
    return adjacent
      ? indent({ payload: { ...area, itemId }, reactivityKeys: structureKeys })
      : move({
          payload: { ...area, itemId, parentItemId: targetParent.item.id },
          reactivityKeys: structureKeys,
        });
  };

  const indentItem = async (node: ItemNode) => {
    const targetParent = precedingOpenSibling(scope.items, node);
    if (targetParent === undefined) {
      return;
    }
    await run({
      itemId: node.item.id,
      save: () => saveIndent(node, targetParent),
      onSaved: (result) => showMovedItem(scope, node, targetParent.item.id, result),
      onFailed: reportItemFailure,
    });
  };

  const outdentItem = async (node: ItemNode) => {
    if (node.item.parentItemId === null) {
      return;
    }
    const grandparentId = findItemNode(scope.items, node.item.parentItemId)?.item.parentItemId;
    await run({
      itemId: node.item.id,
      save: () =>
        outdent({ payload: { ...area, itemId: node.item.id }, reactivityKeys: structureKeys }),
      onSaved: (result) => showMovedItem(scope, node, grandparentId ?? null, result),
      onFailed: reportItemFailure,
    });
  };

  return { indentItem, outdentItem };
}

function chooseParent(scope: ItemStructureScope, node: ItemNode) {
  const options = [
    { value: TOP_LEVEL_CHOICE, label: `${scope.areaName} (top level)` },
    ...flattenItemNodes(scope.items).map(({ node: candidate, depth }) => ({
      value: candidate.item.id,
      label: candidate.item.title,
      depth: depth + 1,
    })),
  ];
  return choose({
    title: "Move item",
    label: "Destination",
    options,
    initialValue: node.item.parentItemId ?? TOP_LEVEL_CHOICE,
    confirmLabel: "Move",
  });
}

function chooseArea(scope: ItemStructureScope) {
  return choose({
    title: "Move to area",
    label: "Destination area",
    options: areaChoiceOptions(scope.projectName, scope.folders),
    initialValue: scope.folderId ?? ROOT_AREA_CHOICE,
    confirmLabel: "Move",
  });
}

function useMoveItems(scope: ItemStructureScope) {
  const move = useAtomSet(moveItemAtom, { mode: "promiseExit" });
  const moveToArea = useMoveToArea(scope);
  const run = useItemMoveRunner();

  const moveItemParent = async (node: ItemNode) => {
    let parentItemId: string | null = null;
    await run({
      itemId: node.item.id,
      save: async () => {
        const choice = await chooseParent(scope, node);
        if (choice === null || choice === (node.item.parentItemId ?? TOP_LEVEL_CHOICE)) {
          return null;
        }
        parentItemId = choice === TOP_LEVEL_CHOICE ? null : choice;
        return move({
          payload: {
            projectId: scope.projectId,
            folderId: scope.folderId,
            itemId: node.item.id,
            parentItemId,
          },
          reactivityKeys: [HISTORY_KEY, areaKey(scope.projectId, scope.folderId), PROJECTS_KEY],
        });
      },
      onSaved: (result) => showMovedItem(scope, node, parentItemId, result),
      onFailed: reportItemFailure,
    });
  };

  /** Ctrl+Shift+L and the row menu: picks an area, then moves the whole branch there. */
  const moveItemToArea = async (node: ItemNode) => {
    if (node.item.parentItemId !== null) {
      return;
    }
    let show: ((result: MoveResult) => Promise<void>) | undefined;
    await run({
      itemId: node.item.id,
      save: async () => {
        const choice = await chooseArea(scope);
        if (choice === null || choice === (scope.folderId ?? ROOT_AREA_CHOICE)) {
          return null;
        }
        const moved = await moveToArea(node, choice === ROOT_AREA_CHOICE ? null : choice);
        show = moved.show;
        return moved.exit;
      },
      onSaved: (result) => show?.(result),
      onFailed: reportItemFailure,
    });
  };

  return { moveItemParent, moveItemToArea };
}

function useReorderItems(scope: ItemStructureScope) {
  const reorder = useAtomSet(reorderItemsAtom, { mode: "promiseExit" });
  const saveCardMove = useSaveCardMove(scope.projectId, scope.folderId);
  const serial = useSerialReorder(scope.items);
  const key = areaKey(scope.projectId, scope.folderId);

  const finishMove = async (
    nodes: ItemSiblings,
    focusId: string,
    exit: Exit.Exit<unknown, RpcFailure>,
  ): Promise<boolean> => {
    const saved = await reportItemFailure(exit);
    if (saved) {
      useWorkspaceStore.getState().selectItem(focusId);
      scope.onFocusItem({ id: focusId, afterNodes: nodes });
    }
    return saved;
  };

  /** Alt+↑/↓ on an open card moves it one place in reading order, across sections (§7.17). */
  const stepOpenCard = async (nodes: ItemSiblings, node: ItemNode, offset: -1 | 1) => {
    const groups = buildPriorityGroups(nodes.open, scope.priorityLevels);
    const placement = stepCard(nodes, groups, node.item.id, offset);
    if (placement === null) {
      return false;
    }
    if (keepsSection(node, placement)) {
      return swapCards(nodes, node, placement.targetId);
    }
    return finishMove(nodes, node.item.id, await saveCardMove(node, placement));
  };

  /**
   * A step inside the card's own section swaps it with its neighbour in the persisted sibling
   * order, as legacy ReorderSelectedAsync did, so finished items keep their slots. A drop would
   * insert into the full sibling list and move them (§6.4).
   */
  const swapCards = async (nodes: ItemSiblings, node: ItemNode, targetId: string) => {
    const allIds = persistedSiblingOrder(siblingNodesOf(nodes, null));
    const itemIds = allIds.map((id) =>
      id === node.item.id ? targetId : id === targetId ? node.item.id : id,
    );
    const exit = await reorder({
      payload: {
        projectId: scope.projectId,
        folderId: scope.folderId,
        parentItemId: null,
        itemIds,
      },
      reactivityKeys: [key, HISTORY_KEY],
    });
    return finishMove(nodes, node.item.id, exit);
  };

  /** Alt+↑/↓ on a sub-item or a completed card swaps it with its visible sibling. */
  const swapWithSibling = async (nodes: ItemSiblings, node: ItemNode, offset: -1 | 1) => {
    const parentItemId = node.item.parentItemId;
    const allIds = persistedSiblingOrder(siblingNodesOf(nodes, parentItemId));
    const groupIds = sameGroupSiblingIds(nodes, node);
    const itemIds = swapWithVisibleNeighbor(allIds, groupIds, node.item.id, offset);
    if (itemIds === null) {
      return false;
    }
    const exit = await reorder({
      payload: { projectId: scope.projectId, folderId: scope.folderId, parentItemId, itemIds },
      reactivityKeys: [key, HISTORY_KEY],
    });
    return finishMove(nodes, node.item.id, exit);
  };

  const reorderByOffset = (node: ItemNode, offset: -1 | 1) =>
    serial.run((nodes) =>
      node.item.parentItemId === null && !node.isFinished
        ? stepOpenCard(nodes, node, offset)
        : swapWithSibling(nodes, node, offset),
    );

  return { reorderByOffset };
}

/**
 * Indent, outdent, reparent, area-move and sibling-reorder flows for items.
 * Moves run one at a time behind the editor guard and preserve expansion and
 * row focus across tree structural changes.
 */
export function useItemStructureActions(scope: ItemStructureScope) {
  return {
    ...useIndentAndOutdent(scope),
    ...useMoveItems(scope),
    ...useReorderItems(scope),
  };
}
