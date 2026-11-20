import type { TrashNodeKind } from "@task-tracker/contracts";

const PATH_SEPARATOR = " › ";

/**
 * Floating wall-clock values are formatted in a fixed UTC frame so the reading
 * the server computed for its zone is never shifted again (§5.4).
 */
const FLOATING_FRAME = "UTC";

const FLOATING_PARTS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

function floatingMillis(dateTime: string): number {
  const [, year, month, day, hour, minute, second] = FLOATING_PARTS.exec(dateTime) ?? [];
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  );
}

/**
 * The deletion time as the culture's short date and time, like .NET's "g".
 * `deletedAt` is the server zone's floating reading of the deletion instant.
 */
export function trashDeletionTime(deletedAt: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: FLOATING_FRAME,
  }).format(floatingMillis(deletedAt));
}

/** Where the batch was: its path joined by chevrons, or Home for a project. */
export function trashLocation(path: ReadonlyArray<string>): string {
  return path.length === 0 ? "Home" : path.join(PATH_SEPARATOR);
}

function count(amount: number, noun: string) {
  return amount === 1 ? `1 ${noun}` : `${amount} ${noun}s`;
}

/** The batch's folders and items, counting the top node, such as "2 folders, 5 items". */
export function trashContents(folderCount: number, itemCount: number): string {
  const parts = [
    ...(folderCount > 0 ? [count(folderCount, "folder")] : []),
    ...(itemCount > 0 ? [count(itemCount, "item")] : []),
  ];
  return parts.length === 0 ? "Empty" : parts.join(", ");
}

const KIND_LABELS: Record<typeof TrashNodeKind.Type, string> = {
  project: "Project",
  folder: "Folder",
  item: "Item",
};

/** "Project", "Folder" or "Item". */
export function trashKindLabel(kind: typeof TrashNodeKind.Type): string {
  return KIND_LABELS[kind];
}

/** A number of Trash rows, such as "1 entry" or "3 entries". */
export function trashEntries(entries: number): string {
  return entries === 1 ? "1 entry" : `${entries} entries`;
}
