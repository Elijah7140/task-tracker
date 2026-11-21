import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef } from "react";
import { HISTORY_KEY, HISTORY_REPLAY_KEY, historyStatusAtom } from "../rpc/history-queries.js";
import { IN_PROGRESS_KEY } from "../rpc/in-progress-queries.js";
import { invalidateKeysAtom } from "../rpc/invalidate-keys.js";

/** The same-origin channel the main window and the tray card windows share. */
const CHANNEL_NAME = "task-tracker:data-changed";

/** What another window's write may have changed: recorded data and the in-progress stack. */
const CHANGED_KEYS = [HISTORY_KEY, HISTORY_REPLAY_KEY, IN_PROGRESS_KEY];

/**
 * Tells the app's other windows that this one changed data, such as the tray
 * card completing an item (§7.18). Each window has its own query cache, so
 * they reload what the change could affect. The channel carries no data and
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

/** Reloads recorded data and the in-progress stack when another window announces a change. */
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

/**
 * Announces each new history revision, so a popped-out tray card that stays
 * open hears about the main window's recorded writes and replays (§7.18). The
 * first revision read is only remembered. A window that reloads after another
 * window's announcement and sees a new revision announces once more; the
 * others then find nothing new, so the exchange ends.
 */
export function useAnnounceRecordedChanges() {
  const query = useAtomValue(historyStatusAtom);
  const revision = AsyncResult.isSuccess(query) ? query.value.revision : undefined;
  const seen = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (revision === undefined) {
      return;
    }
    if (seen.current !== undefined && seen.current !== revision) {
      announceDataChanged();
    }
    seen.current = revision;
  }, [revision]);
}
