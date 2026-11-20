import { useAtomSet } from "@effect/atom-react";
import { useEffect } from "react";
import { CURRENT_ITEM_KEY } from "../rpc/current-item-queries.js";
import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "../rpc/history-queries.js";
import { invalidateKeysAtom } from "../rpc/invalidate-keys.js";

/** The same-origin channel the main window and the tray card share. */
const CHANNEL_NAME = "task-tracker:data-changed";

/** What another window's write may have changed: recorded data and the current item. */
const CHANGED_KEYS = [HISTORY_KEY, HISTORY_REPLAY_KEY, CURRENT_ITEM_KEY];

/**
 * Tells the app's other windows that this one changed data, such as the tray
 * card completing the current item (§7.18). Each window has its own query cache,
 * so they reload what the change could affect. The channel carries no data and
 * never leaves the renderer's origin.
 */
export function announceDataChanged() {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage("changed");
  channel.close();
}

/** Reloads recorded data and the current item when another window announces a change. */
export function useDataChangeListener() {
  const invalidate = useAtomSet(invalidateKeysAtom);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => invalidate(CHANGED_KEYS);
    return () => channel.close();
  }, [invalidate]);
}
