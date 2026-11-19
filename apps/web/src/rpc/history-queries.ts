import { TaskTrackerClient } from "./task-tracker-client.js";

/** Invalidated by mutations that can record a history step. */
export const HISTORY_KEY = "history";

/** Invalidated on replay by every surface that reads potentially changed user data. */
export const HISTORY_REPLAY_KEY = "history:replay";

/** Available labels and the session revision used to clear old outcome messages. */
export const historyStatusAtom = TaskTrackerClient.query("GetHistory", undefined, {
  reactivityKeys: [HISTORY_KEY],
});

/** Applies the current undo or redo step. */
export const applyHistoryAtom = TaskTrackerClient.mutation("ApplyHistory");
