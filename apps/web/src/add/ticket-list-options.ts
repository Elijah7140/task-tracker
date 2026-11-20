import type { TicketListEntryProjection, TicketListKind } from "@task-tracker/contracts";
import type { SelectOption } from "../ui/select.js";

type Entry = typeof TicketListEntryProjection.Type;
type Kind = typeof TicketListKind.Type;

/** The dropdown value for "no entry", since dropdown values are strings. */
export const NO_ENTRY = "none";

/**
 * Active entries of one list in order, plus the archived entry already chosen so it stays
 * visible. `parentId` narrows a level to the children of one entry; undefined lists all.
 */
export function offeredEntries(
  entries: ReadonlyArray<Entry>,
  kind: Kind,
  selectedId: string,
  parentId?: string,
): ReadonlyArray<Entry> {
  return entries
    .filter((entry) => entry.listKind === kind)
    .filter((entry) => parentId === undefined || entry.parentId === parentId)
    .filter((entry) => !entry.isArchived || entry.id === selectedId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

const label = (entry: Entry, prefix?: string) => {
  const name = prefix === undefined ? entry.name : `${prefix} › ${entry.name}`;
  return entry.isArchived ? `${name} (archived)` : name;
};

/** "None" then the offered entries of one list, for a person, ticket type or application. */
export function entryOptions(
  entries: ReadonlyArray<Entry>,
  kind: Kind,
  selectedId: string,
  parentId?: string,
): ReadonlyArray<SelectOption<string>> {
  return [
    { value: NO_ENTRY, label: "None" },
    ...offeredEntries(entries, kind, selectedId, parentId).map((entry) => ({
      value: entry.id,
      label: label(entry),
    })),
  ];
}

/**
 * Modules for quick add, which has no Application box: every module, named with its
 * application ("ClockTower › Train"), or only the chosen application's modules.
 */
export function moduleOptions(
  entries: ReadonlyArray<Entry>,
  selectedId: string,
  applicationId: string,
): ReadonlyArray<SelectOption<string>> {
  if (applicationId !== "") {
    return entryOptions(entries, "Module", selectedId, applicationId);
  }
  const applications = new Map(entries.map((entry) => [entry.id, entry]));
  const modules = offeredEntries(entries, "Module", selectedId).toSorted(
    (left, right) =>
      (applications.get(left.parentId ?? "")?.sortOrder ?? 0) -
        (applications.get(right.parentId ?? "")?.sortOrder ?? 0) ||
      left.sortOrder - right.sortOrder,
  );
  return [
    { value: NO_ENTRY, label: "None" },
    ...modules.map((module) => ({
      value: module.id,
      label: label(module, applications.get(module.parentId ?? "")?.name),
    })),
  ];
}

/** The parent entry of a level entry, or "" when it has none or is unknown. */
export function parentOf(entries: ReadonlyArray<Entry>, id: string): string {
  return entries.find((entry) => entry.id === id)?.parentId ?? "";
}
