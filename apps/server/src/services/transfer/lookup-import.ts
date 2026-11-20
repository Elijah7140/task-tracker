import {
  firstDoneStatus,
  isBlankTransferText,
  listOf,
  nameKey,
  readStatusKind,
  trimTransferText,
  type ItemType,
  type LookupDocument,
  type PriorityLevel,
  type StatusLevel,
} from "@task-tracker/core";
import { type ImportContext, type ImportExisting, nextSortOrder } from "./import-plan.js";

const sameName = (existing: string, imported: string | null) =>
  imported !== null && nameKey(existing) === nameKey(trimTransferText(imported));

/** The documents in sort order, each with its position in the file for issue paths. */
function ordered(documents: readonly LookupDocument[]) {
  return documents
    .map((document, index) => ({ document, index }))
    .toSorted((left, right) => (left.document.sortOrder ?? 0) - (right.document.sortOrder ?? 0));
}

function importItemTypes(context: ImportContext, known: ItemType[]): void {
  let order = nextSortOrder(known);
  for (const { document } of ordered(listOf(context.document.itemTypes))) {
    let match = known.find((type) => sameName(type.name, document.name));
    if (match === undefined) {
      match = {
        id: context.newId(),
        name: trimTransferText(document.name!),
        colorKey: document.colorKey,
        iconKey: document.iconKey,
        isBuiltIn: false,
        isArchived: document.isArchived === true,
        sortOrder: order++,
      };
      context.plan.itemTypes.push(match);
      known.push(match);
    }
    context.map.itemTypes.set(document.id!, match.id);
  }
}

/** Exact IDs first, then names, then number-only levels by number and archive state (§7.15). */
function findPriority(
  document: LookupDocument,
  known: readonly PriorityLevel[],
  reserved: ReadonlySet<string>,
): PriorityLevel | undefined {
  const exact = known.find((level) => level.id === document.id);
  if (exact !== undefined) {
    return exact;
  }
  if (!isBlankTransferText(document.name)) {
    return known.find((level) => sameName(level.name, document.name));
  }
  const archived = document.isArchived === true;
  return known
    .filter(
      (level) =>
        level.name.length === 0 &&
        level.number === document.number &&
        level.isArchived === archived &&
        (!archived || !reserved.has(level.id)),
    )
    .toSorted(
      (left, right) => left.sortOrder - right.sortOrder || (left.id < right.id ? -1 : 1),
    )[0];
}

function isNumberTaken(known: readonly PriorityLevel[], level: PriorityLevel): boolean {
  return (
    !level.isArchived &&
    level.number !== null &&
    known.some((other) => !other.isArchived && other.number === level.number)
  );
}

function importPriorityLevels(context: ImportContext, known: PriorityLevel[]): void {
  const documents = listOf(context.document.priorityLevels);
  const reserved = new Set(
    documents.flatMap((document) =>
      known.some((level) => level.id === document.id) ? [document.id!] : [],
    ),
  );
  let order = Math.max(-1, ...known.map((level) => level.sortOrder)) + 1;
  for (const { document, index } of ordered(documents)) {
    let match = findPriority(document, known, reserved);
    if (match === undefined) {
      match = createPriority(context, document, order++);
      if (isNumberTaken(known, match)) {
        context.issues.add(
          `$.priorityLevels[${index}].number`,
          "This priority number is already in use.",
        );
        continue;
      }
      context.plan.priorityLevels.push(match);
      known.push(match);
    }
    reserved.add(match.id);
    context.map.priorityLevels.set(document.id!, match.id);
  }
}

function createPriority(
  context: ImportContext,
  document: LookupDocument,
  sortOrder: number,
): PriorityLevel {
  return {
    id: context.newId(),
    name: trimTransferText(document.name ?? ""),
    number: document.number,
    colorKey: document.colorKey,
    isBuiltIn: false,
    isArchived: document.isArchived === true,
    sortOrder,
  };
}

function importStatuses(context: ImportContext, known: StatusLevel[]): void {
  let order = Math.max(-1, ...known.map((status) => status.sortOrder)) + 1;
  for (const { document, index } of ordered(listOf(context.document.statuses))) {
    const kind = readStatusKind(document.kind)!;
    let status = known.find((row) => sameName(row.name, document.name));
    if (status === undefined) {
      status = {
        id: context.newId(),
        name: trimTransferText(document.name!),
        kind,
        isArchived: document.isArchived === true,
        sortOrder: order++,
      };
      context.plan.statuses.push(status);
      known.push(status);
    } else if (status.kind !== kind) {
      context.issues.add(`$.statuses[${index}].kind`, "The matching status has a different kind.");
    }
    context.map.statuses.set(document.id!, status.id);
  }
  context.map.firstDoneStatusId = firstDoneStatus(known)?.id ?? null;
}

/**
 * Matches the file's item types, priority levels and statuses to existing ones by
 * name ignoring case and plans the missing ones after the existing lists (§7.9).
 */
export function importLookups(context: ImportContext, existing: ImportExisting): void {
  importItemTypes(context, [...existing.itemTypes]);
  importPriorityLevels(context, [...existing.priorityLevels]);
  importStatuses(context, [...existing.statuses]);
}
