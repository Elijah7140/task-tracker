import { useAtomSet } from "@effect/atom-react";
import type { Exit } from "effect";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { dropItemAtom, moveItemAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { findItemNode, type ItemNode } from "./item-outline.js";
import { useSaveCardMove } from "./use-card-move.js";
import type { ItemDrop } from "./use-item-drag.js";
import { type MoveResult, useItemMoveRunner } from "./use-item-move-runner.js";
import {
  type ItemStructureScope,
  showMovedItem,
  useMoveToArea,
} from "./use-item-structure-actions.js";

/** A drop's save and how its result is shown. */
interface PlannedDrop {
  readonly save: () => Promise<Exit.Exit<unknown, RpcFailure>>;
  readonly show: (result: MoveResult) => void | Promise<void>;
}

/** The parent a row drop places the item under, read from the snapshot the drop targeted. */
function rowDropParent(scope: ItemStructureScope, drop: Extract<ItemDrop, { kind: "row" }>) {
  return drop.position === "into"
    ? drop.id
    : (findItemNode(scope.items, drop.id)?.item.parentItemId ?? null);
}

function useDropPlans(scope: ItemStructureScope) {
  const dropOnRow = useAtomSet(dropItemAtom, { mode: "promiseExit" });
  const move = useAtomSet(moveItemAtom, { mode: "promiseExit" });
  const saveCardMove = useSaveCardMove(scope.projectId, scope.folderId);
  const moveToArea = useMoveToArea(scope);
  const area = { projectId: scope.projectId, folderId: scope.folderId };
  const reactivityKeys = [areaKey(scope.projectId, scope.folderId), PROJECTS_KEY, HISTORY_KEY];

  return (source: ItemNode, drop: ItemDrop): PlannedDrop => {
    const itemId = source.item.id;
    switch (drop.kind) {
      case "row": {
        const payload = { ...area, itemId, targetItemId: drop.id, position: drop.position };
        const parentItemId = rowDropParent(scope, drop);
        return {
          save: () => dropOnRow({ payload, reactivityKeys }),
          show: (result) => showMovedItem(scope, source, parentItemId, result),
        };
      }
      case "card":
      case "group":
        return {
          save: () => saveCardMove(source, drop.placement),
          show: (result) => showMovedItem(scope, source, null, result),
        };
      case "root-end":
        return {
          save: () => move({ payload: { ...area, itemId, parentItemId: null }, reactivityKeys }),
          show: (result) => showMovedItem(scope, source, null, result),
        };
      case "area": {
        let show: (result: MoveResult) => Promise<void> = async () => {};
        return {
          save: async () => {
            const moved = await moveToArea(source, drop.folderId);
            show = moved.show;
            return moved.exit;
          },
          show: (result) => show(result),
        };
      }
    }
  };
}

/**
 * Applies pointer drops (§7.5): before, after or into a row, at the end of the
 * area's top level, or onto another area. The server validates each drop
 * against the current tree; a failure that still concerns this area is shown
 * inline.
 */
export function useItemDropActions(scope: ItemStructureScope) {
  const plan = useDropPlans(scope);
  const run = useItemMoveRunner();

  return (source: ItemNode, drop: ItemDrop) => {
    const planned = plan(source, drop);
    return run({
      itemId: source.item.id,
      save: () => {
        scope.onMoveError(null);
        return planned.save();
      },
      onSaved: planned.show,
      onFailed: (exit) => scope.onMoveError(describeRpcFailure(exit.cause)),
    });
  };
}
