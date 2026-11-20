import { useAtomSet } from "@effect/atom-react";
import type { TicketListEntryProjection, TicketListKind } from "@task-tracker/contracts";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { reportFailure } from "../dialogs/report-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import {
  addTicketListEntryAtom,
  archiveTicketListEntryAtom,
  renameTicketListEntryAtom,
  reorderTicketListEntriesAtom,
  restoreTicketListEntryAtom,
  TICKET_LISTS_KEY,
} from "../rpc/ticket-field-queries.js";
import { prompt } from "../state/dialog-store.js";

type Entry = typeof TicketListEntryProjection.Type;
type Kind = typeof TicketListKind.Type;

const reactivityKeys = [TICKET_LISTS_KEY, HISTORY_KEY];

/** Sentence-case names for prompts, such as "Rename ticket type". */
export const LIST_NOUNS: Readonly<Record<Kind, string>> = {
  Person: "person",
  TicketType: "ticket type",
  Application: "application",
  Module: "module",
  Interface: "interface",
};

/** The entries of one list level, in order, archived ones included. */
export function siblingsOf(entries: ReadonlyArray<Entry>, kind: Kind, parentId: string | null) {
  return entries
    .filter((entry) => entry.listKind === kind && entry.parentId === parentId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

/**
 * Add, rename, archive, restore and move for the ticket lists (§7.19). Each change is one
 * undo step on the server, and a refused change shows the server's message.
 */
export function useTicketListActions(entries: ReadonlyArray<Entry>) {
  const add = useAtomSet(addTicketListEntryAtom, { mode: "promiseExit" });
  const rename = useAtomSet(renameTicketListEntryAtom, { mode: "promiseExit" });
  const archive = useAtomSet(archiveTicketListEntryAtom, { mode: "promiseExit" });
  const restore = useAtomSet(restoreTicketListEntryAtom, { mode: "promiseExit" });
  const reorder = useAtomSet(reorderTicketListEntriesAtom, { mode: "promiseExit" });
  const report = (exit: Parameters<typeof reportFailure>[1]) =>
    reportFailure("List change failed", exit);

  return {
    add: async (listKind: Kind, parentId: string | null, name: string) =>
      report(await add({ payload: { listKind, parentId, name }, reactivityKeys })),
    rename: async (entry: Entry) => {
      const name = await prompt({
        title: `Rename ${LIST_NOUNS[entry.listKind]}`,
        label: "Name",
        initialValue: entry.name,
        confirmLabel: "Rename",
        validation: NAME_VALIDATION,
      });
      if (name !== null) {
        await report(await rename({ payload: { id: entry.id, name }, reactivityKeys }));
      }
    },
    setArchived: async (entry: Entry, archived: boolean) => {
      const change = archived ? archive : restore;
      await report(await change({ payload: { id: entry.id }, reactivityKeys }));
    },
    move: async (entry: Entry, direction: -1 | 1) => {
      const ids = siblingsOf(entries, entry.listKind, entry.parentId).map((row) => row.id);
      const index = ids.indexOf(entry.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) {
        return;
      }
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      const payload = { listKind: entry.listKind, parentId: entry.parentId, ids };
      await report(await reorder({ payload, reactivityKeys }));
    },
  };
}

/** The actions {@link useTicketListActions} returns. */
export type TicketListActions = ReturnType<typeof useTicketListActions>;
