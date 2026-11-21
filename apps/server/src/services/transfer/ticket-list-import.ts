import {
  listOf,
  nameKey,
  trimText,
  type TicketListEntry,
  type TicketListEntryDocument,
  type TicketListKind,
} from "@task-tracker/core";
import type { ImportContext, ImportExisting } from "./import-plan.js";

/** Same list, same parent and the same name ignoring case: the identity of an entry. */
const entryKey = (kind: string, parentId: string | null, name: string) =>
  `${kind}\u0000${parentId ?? ""}\u0000${nameKey(trimText(name))}`;

/** Orders entries so every level comes after the level above it, keeping file order. */
function parentsFirst(documents: readonly TicketListEntryDocument[]) {
  const rank = (document: TicketListEntryDocument) =>
    document.listKind === "Module" ? 1 : document.listKind === "Interface" ? 2 : 0;
  return documents.toSorted((left, right) => rank(left) - rank(right));
}

/**
 * Matches the file's People, ticket types and levels (§7.19) to existing entries by list,
 * parent and name, and plans the rest as new entries after their siblings. An archived
 * match is reused as it is, so tickets keep pointing at it.
 */
export function importTicketLists(context: ImportContext, existing: ImportExisting): void {
  const known = new Map(
    existing.ticketLists.map((entry) => [
      entryKey(entry.listKind, entry.parentId, entry.name),
      entry,
    ]),
  );
  const siblingCount = new Map<string, number>();
  for (const entry of existing.ticketLists) {
    const level = `${entry.listKind}\u0000${entry.parentId ?? ""}`;
    siblingCount.set(level, (siblingCount.get(level) ?? 0) + 1);
  }
  for (const document of parentsFirst(listOf(context.document.ticketLists))) {
    const parentId =
      document.parentId === null
        ? null
        : (context.map.ticketEntries.get(document.parentId) ?? null);
    const key = entryKey(document.listKind!, parentId, document.name!);
    const match = known.get(key) ?? planEntry(context, document, parentId, siblingCount);
    known.set(key, match);
    context.map.ticketEntries.set(document.id!, match.id);
  }
}

function planEntry(
  context: ImportContext,
  document: TicketListEntryDocument,
  parentId: string | null,
  siblingCount: Map<string, number>,
): TicketListEntry {
  const level = `${document.listKind}\u0000${parentId ?? ""}`;
  const sortOrder = siblingCount.get(level) ?? 0;
  siblingCount.set(level, sortOrder + 1);
  const entry: TicketListEntry = {
    id: context.newId(),
    listKind: document.listKind as TicketListKind,
    parentId,
    name: trimText(document.name!),
    isArchived: document.isArchived === true,
    sortOrder,
  };
  context.plan.ticketLists.push(entry);
  return entry;
}
