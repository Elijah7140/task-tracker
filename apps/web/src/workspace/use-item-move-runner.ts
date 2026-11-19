import { type Exit } from "effect";
import { useEffect, useRef } from "react";
import { resolveEditorDraft } from "../editor/editor-draft-guard.js";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import { hasItemEditorEdits, isItemEditorOpen } from "../state/item-editor-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";

/** How a finished move may update selection and focus once it has saved. */
export interface MoveResult {
  /** True when the moved item stays or becomes the selection, so the view follows it. */
  readonly follow: boolean;
  /** True when the moved row may also take keyboard focus. */
  readonly focusRow: boolean;
}

/** One item move: the save, and what to do with its outcome in the area it started in. */
export interface ItemMove {
  /** The moved item. */
  readonly itemId: string;
  /** Saves the move. Null means there was nothing to save, as after a cancelled picker. */
  readonly save: () => Promise<Exit.Exit<unknown, RpcFailure> | null>;
  readonly onSaved: (result: MoveResult) => unknown;
  /** Reports a failure that the user can still relate to the move. */
  readonly onFailed: (exit: Exit.Failure<unknown, RpcFailure>) => unknown;
}

/** Selection and editor state captured once the draft guard has run. */
interface MoveOrigin {
  readonly selectionVersion: number;
}

function captureOrigin(): MoveOrigin {
  return { selectionVersion: useWorkspaceStore.getState().itemSelectionVersion };
}

/** True when the user has not selected another item or typed editor edits since the move began. */
function isCurrent(origin: MoveOrigin): boolean {
  const { itemSelectionVersion } = useWorkspaceStore.getState();
  return itemSelectionVersion === origin.selectionVersion && !hasItemEditorEdits();
}

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/**
 * Runs item moves one at a time (§7.5). The unsaved-editor guard runs first and
 * a cancelled guard cancels the move. Navigation, a newer selection (even one
 * that returns to the same item) and editor edits typed during the save take
 * precedence when the move finishes; a newer editor draft also keeps focus.
 */
export function useItemMoveRunner() {
  const mounted = useMounted();

  const finish = async (
    move: ItemMove,
    origin: MoveOrigin,
    exit: Exit.Exit<unknown, RpcFailure>,
  ) => {
    if (!mounted.current) {
      return;
    }
    const current = isCurrent(origin);
    if (exit._tag === "Failure") {
      if (current) {
        await move.onFailed(exit);
      }
      return;
    }
    const { selectedItemId } = useWorkspaceStore.getState();
    const follow = current || selectedItemId === move.itemId;
    await move.onSaved({ follow, focusRow: current && !isItemEditorOpen() });
  };

  return async (move: ItemMove) => {
    const store = useWorkspaceStore.getState();
    if (store.itemMoveSaving) {
      return;
    }
    store.setItemMoveSaving(true);
    try {
      if (!(await resolveEditorDraft())) {
        return;
      }
      const origin = captureOrigin();
      const exit = await move.save();
      if (exit !== null) {
        await finish(move, origin, exit);
      }
    } finally {
      useWorkspaceStore.getState().setItemMoveSaving(false);
    }
  };
}
