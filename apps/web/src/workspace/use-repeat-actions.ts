import { useAtomSet } from "@effect/atom-react";
import type { Item } from "@task-tracker/contracts";
import { Exit } from "effect";
import { reportFailure } from "../dialogs/report-failure.js";
import { areaKey } from "../rpc/area-queries.js";
import { CALENDAR_KEY } from "../rpc/calendar-queries.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { skipRepeatAtom, stopRepeatingAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { LAST_REPEAT_MESSAGE, showStatusNotice } from "../state/status-notice-store.js";

type ItemRecord = typeof Item.Type;

const keysFor = (item: ItemRecord) => [
  HISTORY_KEY,
  areaKey(item.projectId, item.folderId),
  PROJECTS_KEY,
  CALENDAR_KEY,
];

/**
 * "Skip this one" and "Stop repeating" (§7.11), shared by row menus and the
 * editor. Each resolves true once the server applied the change.
 */
export function useRepeatActions() {
  const skip = useAtomSet(skipRepeatAtom, { mode: "promiseExit" });
  const stop = useAtomSet(stopRepeatingAtom, { mode: "promiseExit" });

  const skipRepeat = async (item: ItemRecord): Promise<boolean> => {
    const exit = await skip({ payload: { itemId: item.id }, reactivityKeys: keysFor(item) });
    if (Exit.isFailure(exit)) {
      return reportFailure("Cannot skip this repeat", exit);
    }
    if (!exit.value) {
      showStatusNotice(`${LAST_REPEAT_MESSAGE} There is no next date to skip to.`);
    }
    return exit.value;
  };

  const stopRepeating = async (item: ItemRecord): Promise<boolean> => {
    const exit = await stop({ payload: { itemId: item.id }, reactivityKeys: keysFor(item) });
    return Exit.isFailure(exit) ? reportFailure("Cannot stop repeating", exit) : true;
  };

  return { skipRepeat, stopRepeating };
}
