import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { watchRemindersAtom } from "../rpc/reminder-queries.js";
import { useReminderPanelStore } from "../state/reminder-panel-store.js";

/**
 * Keeps the panel store current. Each answer names a version; the next request
 * waits on the server for a different one, so updates arrive as they happen.
 * Returns a retry for a failed request.
 */
export function useReminderWatch(): () => void {
  const version = useReminderPanelStore((state) => state.panel?.version ?? -1);
  const atom = watchRemindersAtom(version);
  const result = useAtomValue(atom);
  const retry = useAtomRefresh(atom);
  useEffect(() => {
    const { receive, fail } = useReminderPanelStore.getState();
    if (AsyncResult.isSuccess(result) && result.value.version !== version) {
      receive(result.value);
    } else if (AsyncResult.isFailure(result)) {
      fail(describeRpcFailure(result.cause));
    }
  }, [result, version]);
  return retry;
}
