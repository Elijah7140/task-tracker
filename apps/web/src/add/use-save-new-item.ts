import { useAtomSet } from "@effect/atom-react";
import type { FieldValueInput, Item } from "@task-tracker/contracts";
import { Exit } from "effect";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { addItemAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { TICKETS_KEY } from "../rpc/ticket-queries.js";
import { TODAY_KEY } from "../rpc/today-queries.js";
import { type AddItemDraft, type AddKind, buildAddPayload } from "./add-item-draft.js";

/** A saved item, or the message the dialog shows instead. */
export type SaveNewItemResult =
  | { readonly ok: true; readonly item: typeof Item.Type }
  | { readonly ok: false; readonly message: string };

/**
 * Sends a new ToDo or Ticket as one AddItem call (§7.19) and refreshes every view that can
 * show it: the area, project counts, Tickets, Today and the Edit menu's undo label.
 */
export function useSaveNewItem(projectId: string, folderId: string | null) {
  const add = useAtomSet(addItemAtom, { mode: "promiseExit" });
  const reactivityKeys = [
    HISTORY_KEY,
    areaKey(projectId, folderId),
    PROJECTS_KEY,
    TICKETS_KEY,
    TODAY_KEY,
  ];

  return async (
    kind: AddKind,
    draft: AddItemDraft,
    customValues: ReadonlyArray<typeof FieldValueInput.Type>,
  ): Promise<SaveNewItemResult> => {
    const built = buildAddPayload(kind, draft);
    if (!built.ok) {
      return built;
    }
    const { parentItemId, fields, reminder, ticket } = built;
    const payload = {
      projectId,
      folderId,
      parentItemId,
      kind,
      fields,
      reminder,
      ...(kind === "Todo" && customValues.length > 0 ? { customValues } : {}),
      ...(ticket === undefined ? {} : { ticket }),
    };
    const exit = await add({ payload, reactivityKeys });
    return Exit.isSuccess(exit)
      ? { ok: true, item: exit.value }
      : { ok: false, message: describeRpcFailure(exit.cause) };
  };
}
