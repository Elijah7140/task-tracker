import type { Guid } from "@task-tracker/contracts";
import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

type Id = typeof Guid.Type;

/** Reactivity key for one item's stored links. Item edits that send links invalidate it. */
export const itemLinksKey = (itemId: Id) => `item-links:${itemId}`;

/** One item's stored links in list order (§7.10). Undo and redo refresh them. */
export const itemLinksAtom = (itemId: Id) =>
  TaskTrackerClient.query(
    "LoadItemLinks",
    { itemId },
    { reactivityKeys: [HISTORY_REPLAY_KEY, itemLinksKey(itemId)] },
  );
