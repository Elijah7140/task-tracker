import { useAtomSet } from "@effect/atom-react";
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
import { useWorkspaceStore } from "../state/workspace-store.js";
import { useSerialReorder } from "../ui/use-serial-reorder.js";
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
import { type DropPlacement, moveAmongVisible, swapWithVisibleNeighbor } from "./reorder-plan.js";

const TOP_LEVEL_CHOICE = "top-level";

/** Context needed by item hierarchy and order mutations. */
export interface ItemStructureScope {
  readonly projectId: string;
  readonly projectName: string;
  readonly folderId: string | null;
  readonly areaName: string;
  readonly folders: ReadonlyArray<Folder>;
  readonly items: ItemSiblings;
  readonly onFocusItem: (request: ItemFocusRequest) => void;
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

function useIndentAndOutdent(scope: ItemStructureScope) {
  const indent = useAtomSet(indentItemAtom, { mode: "promiseExit" });
  const outdent = useAtomSet(outdentItemAtom, { mode: "promiseExit" });
  const move = useAtomSet(moveItemAtom, { mode: "promiseExit" });
  const key = areaKey(scope.projectId, scope.folderId);
  const structureKeys = [key, PROJECTS_KEY, HISTORY_KEY];

  const indentItem = async (node: ItemNode) => {
    const targetParent = precedingOpenSibling(scope.items, node);
    if (targetParent === undefined) {
      return;
    }
    const siblingIds = persistedSiblingOrder(siblingNodesOf(scope.items, node.item.parentItemId));
    const index = siblingIds.indexOf(node.item.id);
    const adjacent = index > 0 && siblingIds[index - 1] === targetParent.item.id;
    const area = { projectId: scope.projectId, folderId: scope.folderId };
    const exit = adjacent
      ? await indent({
          payload: { ...area, itemId: node.item.id },
          reactivityKeys: structureKeys,
        })
      : await move({
          payload: { ...area, itemId: node.item.id, parentItemId: targetParent.item.id },
          reactivityKeys: structureKeys,
        });
    if (await reportItemFailure(exit)) {
      expandBranch(scope.items, targetParent.item.id);
      useWorkspaceStore.getState().selectItem(node.item.id);
      scope.onFocusItem({ id: node.item.id, expectedParentId: targetParent.item.id });
    }
  };

  const outdentItem = async (node: ItemNode) => {
    if (node.item.parentItemId === null) {
      return;
    }
    const parent = findItemNode(scope.items, node.item.parentItemId);
    const grandparentId = parent?.item.parentItemId ?? null;
    const exit = await outdent({
      payload: { projectId: scope.projectId, folderId: scope.folderId, itemId: node.item.id },
      reactivityKeys: structureKeys,
    });
    if (await reportItemFailure(exit)) {
      useWorkspaceStore.getState().selectItem(node.item.id);
      scope.onFocusItem({ id: node.item.id, expectedParentId: grandparentId });
    }
  };

  return { indentItem, outdentItem };
}

function useMoveItems(scope: ItemStructureScope) {
  const move = useAtomSet(moveItemAtom, { mode: "promiseExit" });
  const moveToArea = useAtomSet(moveItemToAreaAtom, { mode: "promiseExit" });

  const moveItemParent = async (node: ItemNode) => {
    const currentParent = node.item.parentItemId ?? TOP_LEVEL_CHOICE;
    const options = [
      { value: TOP_LEVEL_CHOICE, label: `${scope.areaName} (top level)` },
      ...flattenItemNodes(scope.items).map(({ node: candidate, depth }) => ({
        value: candidate.item.id,
        label: candidate.item.title,
        depth: depth + 1,
      })),
    ];
    const choice = await choose({
      title: "Move item",
      label: "Destination",
      options,
      initialValue: currentParent,
      confirmLabel: "Move",
    });
    if (choice === null || choice === currentParent) {
      return;
    }
    const parentItemId = choice === TOP_LEVEL_CHOICE ? null : choice;
    const exit = await move({
      payload: {
        projectId: scope.projectId,
        folderId: scope.folderId,
        itemId: node.item.id,
        parentItemId,
      },
      reactivityKeys: [HISTORY_KEY, areaKey(scope.projectId, scope.folderId), PROJECTS_KEY],
    });
    if (await reportItemFailure(exit)) {
      if (parentItemId !== null) {
        expandBranch(scope.items, parentItemId);
      }
      useWorkspaceStore.getState().selectItem(node.item.id);
      scope.onFocusItem({ id: node.item.id, expectedParentId: parentItemId });
    }
  };

  const moveItemToArea = async (node: ItemNode) => {
    if (node.item.parentItemId !== null) {
      return;
    }
    const currentArea = scope.folderId ?? ROOT_AREA_CHOICE;
    const choice = await choose({
      title: "Move to area",
      label: "Destination area",
      options: areaChoiceOptions(scope.projectName, scope.folders),
      initialValue: currentArea,
      confirmLabel: "Move",
    });
    if (choice === null || choice === currentArea) {
      return;
    }
    const targetFolderId = choice === ROOT_AREA_CHOICE ? null : choice;
    const exit = await moveToArea({
      payload: {
        projectId: scope.projectId,
        sourceFolderId: scope.folderId,
        targetFolderId,
        itemId: node.item.id,
      },
      reactivityKeys: [
        HISTORY_KEY,
        areaKey(scope.projectId, scope.folderId),
        areaKey(scope.projectId, targetFolderId),
      ],
    });
    if (await reportItemFailure(exit)) {
      focusAfterDeparture(scope, node);
    }
  };

  return { moveItemParent, moveItemToArea };
}

function useReorderItems(scope: ItemStructureScope) {
  const reorder = useAtomSet(reorderItemsAtom, { mode: "promiseExit" });
  const serial = useSerialReorder(scope.items);
  const key = areaKey(scope.projectId, scope.folderId);

  const applyOrder = async (
    nodes: ItemSiblings,
    parentItemId: string | null,
    focusId: string,
    itemIds: ReadonlyArray<string> | null,
  ): Promise<boolean> => {
    if (itemIds === null) {
      return false;
    }
    const exit = await reorder({
      payload: { projectId: scope.projectId, folderId: scope.folderId, parentItemId, itemIds },
      reactivityKeys: [key, HISTORY_KEY],
    });
    const saved = await reportItemFailure(exit);
    if (saved) {
      useWorkspaceStore.getState().selectItem(focusId);
      scope.onFocusItem({ id: focusId, afterNodes: nodes });
    }
    return saved;
  };

  /** Swaps an item with its neighbour among open or among finished siblings (legacy). */
  const reorderByOffset = (node: ItemNode, offset: -1 | 1) =>
    serial.run((nodes) => {
      const parentItemId = node.item.parentItemId;
      const allIds = persistedSiblingOrder(siblingNodesOf(nodes, parentItemId));
      const groupIds = sameGroupSiblingIds(nodes, node);
      const order = swapWithVisibleNeighbor(allIds, groupIds, node.item.id, offset);
      return applyOrder(nodes, parentItemId, node.item.id, order);
    });

  const reorderByDrop = (
    parentItemId: string | null,
    sourceId: string,
    targetId: string,
    placement: DropPlacement,
  ) =>
    serial.run((nodes) => {
      const siblings = siblingNodesOf(nodes, parentItemId);
      const allIds = persistedSiblingOrder(siblings);
      const visibleIds = siblings.open.map((sibling) => sibling.item.id);
      const order = moveAmongVisible(allIds, visibleIds, sourceId, targetId, placement);
      return applyOrder(nodes, parentItemId, sourceId, order);
    });

  return { reorderByOffset, reorderByDrop };
}

/**
 * Indent, outdent, reparent, area-move and sibling-reorder flows for items.
 * Preserves expansion and row focus across tree structural changes.
 */
export function useItemStructureActions(scope: ItemStructureScope) {
  return {
    ...useIndentAndOutdent(scope),
    ...useMoveItems(scope),
    ...useReorderItems(scope),
  };
}
