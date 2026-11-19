import { useAtomSet } from "@effect/atom-react";
import { useRef } from "react";
import { reportFailure } from "../dialogs/report-failure.js";
import { areaKey } from "../rpc/area-queries.js";
import { CALENDAR_KEY } from "../rpc/calendar-queries.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { pushBackOneDayAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { useRunReturnGuards } from "../shell/return-guards.js";
import { isPageCovered, runReturnPageWrite } from "../state/return-page-store.js";

/** The item a push back moves and the area whose list shows it. */
export interface PushBackTarget {
  readonly id: string;
  readonly projectId: string;
  readonly folderId: string | null;
}

/**
 * Push back one day (§7.14), shared by the workspace, Search and Calendar.
 * In the workspace an unsaved editor draft is resolved first. On a covering
 * page the page behind is marked out of date and Back waits for the write.
 * The item's area, project counts, Calendar and Search (through the history
 * key) refresh after a save; a refusal shows the server's reason. One push back
 * runs at a time, and the result is true once the server applied it.
 */
export function usePushBackOneDay() {
  const pushBack = useAtomSet(pushBackOneDayAtom, { mode: "promiseExit" });
  const resolveDrafts = useRunReturnGuards();
  const running = useRef(false);

  const save = async (target: PushBackTarget) => {
    const exit = await pushBack({
      payload: { itemId: target.id },
      reactivityKeys: [
        HISTORY_KEY,
        areaKey(target.projectId, target.folderId),
        PROJECTS_KEY,
        CALENDAR_KEY,
      ],
    });
    return reportFailure("Push back one day", exit);
  };

  return async (target: PushBackTarget): Promise<boolean> => {
    if (running.current) {
      return false;
    }
    running.current = true;
    try {
      if (isPageCovered()) {
        return await runReturnPageWrite(() => save(target));
      }
      return (await resolveDrafts()) && (await save(target));
    } finally {
      running.current = false;
    }
  };
}
