import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Exit } from "effect";
import { AsyncResult } from "effect/reactivity";
import { announceDataChanged } from "../native/data-change-broadcast.js";
import {
  CURRENT_ITEM_KEY,
  currentItemAtom,
  setCurrentItemAtom,
} from "../rpc/current-item-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { notify } from "../state/dialog-store.js";

/**
 * The current item's ID, or null when none is chosen, it is deleted, or the
 * first read has not finished. A reload keeps the previous value meanwhile.
 */
export function useCurrentItemId(): string | null {
  const result = useAtomValue(currentItemAtom);
  return AsyncResult.getOrElse(result, () => null)?.itemId ?? null;
}

/**
 * Makes an item current, or clears the choice with null (§7.18). A refusal,
 * such as an item deleted meanwhile, is explained in a "Current item" message.
 */
export function useSetCurrentItem() {
  const set = useAtomSet(setCurrentItemAtom, { mode: "promiseExit" });
  return async (itemId: string | null) => {
    const exit = await set({ payload: { itemId }, reactivityKeys: [CURRENT_ITEM_KEY] });
    if (Exit.isFailure(exit)) {
      await notify({ title: "Current item", message: describeRpcFailure(exit.cause) });
      return;
    }
    announceDataChanged();
  };
}
