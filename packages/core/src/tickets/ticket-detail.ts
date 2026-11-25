import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { isBlankText, trimText } from "../text/dotnet-white-space.js";
import {
  parentKindOf,
  ticketListNoun,
  withArticle,
  type TicketListEntry,
  type TicketListKind,
} from "./ticket-list-entry.js";

/**
 * The fixed ticket fields that have no shared item column (§7.19). Summary, detail,
 * number, priority, status and completion date live on the item itself.
 */
export interface TicketDetail {
  readonly itemId: string;
  readonly requestorId: string | null;
  readonly applicationId: string | null;
  readonly moduleId: string | null;
  readonly interfaceId: string | null;
  readonly dispatchedToId: string | null;
  readonly pendingPersonId: string | null;
  readonly ticketTypeId: string | null;
  /**
   * The parent ticket's number as free text (§7.19). Task Tracker may or may not hold a
   * ticket with that number; the tree position is `ParentItemId` and is separate.
   */
  readonly parentTicketNumber: string | null;
  /**
   * Whether the card shows the Detail, or null to follow the global
   * `showTicketDetailOnCards` setting (§7.17).
   */
  readonly showDetailOnCard: boolean | null;
}

/**
 * The ticket fields a save supplies. The item ID comes from the item being saved, and the
 * card's Detail override keeps its stored value: only the card menu changes it.
 */
export type TicketDetailInput = Omit<TicketDetail, "itemId" | "showDetailOnCard">;

/** The longest parent ticket number accepted, as for a ticket number. */
const maxParentTicketNumberLength = 100;

/** A ticket with nothing filled in beyond its item columns. */
export function emptyTicketDetail(itemId: string): TicketDetail {
  return {
    itemId,
    requestorId: null,
    applicationId: null,
    moduleId: null,
    interfaceId: null,
    dispatchedToId: null,
    pendingPersonId: null,
    ticketTypeId: null,
    parentTicketNumber: null,
    showDetailOnCard: null,
  };
}

/** Trims a parent ticket number, treating blank text as none. */
export function parentTicketNumber(text: string | null): string | null {
  if (text === null || isBlankText(text)) {
    return null;
  }
  const trimmed = trimText(text);
  if (trimmed.length > maxParentTicketNumberLength) {
    throw new MetadataRuleError(
      `Parent ticket must be at most ${maxParentTicketNumberLength} characters.`,
    );
  }
  return trimmed;
}

/** Whether a ticket's card shows its Detail: its own choice, or else the global setting. */
export function showsDetailOnCard(
  detail: Pick<TicketDetail, "showDetailOnCard"> | null,
  globalDefault: boolean,
): boolean {
  return detail?.showDetailOnCard ?? globalDefault;
}

type EntryField =
  | "requestorId"
  | "applicationId"
  | "moduleId"
  | "interfaceId"
  | "dispatchedToId"
  | "pendingPersonId"
  | "ticketTypeId";

const entryFields: ReadonlyArray<readonly [EntryField, TicketListKind, string]> = [
  ["requestorId", "Person", "Requestor"],
  ["dispatchedToId", "Person", "Dispatched to"],
  ["pendingPersonId", "Person", "Pending user"],
  ["ticketTypeId", "TicketType", "Ticket type"],
  ["applicationId", "Application", "Application"],
  ["moduleId", "Module", "Module"],
  ["interfaceId", "Interface", "Interface"],
];

function checkEntry(
  detail: TicketDetailInput,
  previous: TicketDetail | null,
  byId: ReadonlyMap<string, TicketListEntry>,
  [field, kind, label]: readonly [EntryField, TicketListKind, string],
) {
  const id = detail[field];
  if (id === null) {
    return;
  }
  const entry = byId.get(id);
  if (entry === undefined || entry.listKind !== kind) {
    throw new MetadataRuleError(`${label} must be ${withArticle(kind)} from the list.`);
  }
  if (entry.isArchived && previous?.[field] !== id) {
    throw new MetadataRuleError(`${label} '${entry.name}' is archived.`);
  }
}

/** Fills in a level's parents, so choosing an Interface or Module implies the rest. */
function withParentLevels(
  detail: TicketDetailInput,
  byId: ReadonlyMap<string, TicketListEntry>,
): TicketDetailInput {
  const interfaceEntry = detail.interfaceId === null ? undefined : byId.get(detail.interfaceId);
  const moduleId = detail.moduleId ?? interfaceEntry?.parentId ?? null;
  const moduleEntry = moduleId === null ? undefined : byId.get(moduleId);
  const applicationId = detail.applicationId ?? moduleEntry?.parentId ?? null;
  return { ...detail, moduleId, applicationId };
}

function checkLevelChain(detail: TicketDetailInput, byId: ReadonlyMap<string, TicketListEntry>) {
  const chain: ReadonlyArray<readonly [EntryField, EntryField]> = [
    ["interfaceId", "moduleId"],
    ["moduleId", "applicationId"],
  ];
  for (const [childField, parentField] of chain) {
    const child = detail[childField] === null ? undefined : byId.get(detail[childField]!);
    if (child !== undefined && child.parentId !== detail[parentField]) {
      const parentKind = parentKindOf(child.listKind)!;
      throw new MetadataRuleError(
        `${child.name} is not a ${ticketListNoun(child.listKind)} of the chosen ${ticketListNoun(parentKind)}.`,
      );
    }
  }
}

/**
 * Validates a ticket save against the ticket lists. A level implies its parents, each level
 * must sit under the one above it, and an archived entry may stay but not be newly chosen.
 */
export function validateTicketDetail(
  itemId: string,
  input: TicketDetailInput,
  entries: readonly TicketListEntry[],
  previous: TicketDetail | null,
): TicketDetail {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const detail = withParentLevels(input, byId);
  for (const field of entryFields) {
    checkEntry(detail, previous, byId, field);
  }
  checkLevelChain(detail, byId);
  return {
    ...detail,
    itemId,
    parentTicketNumber: parentTicketNumber(detail.parentTicketNumber),
    showDetailOnCard: previous?.showDetailOnCard ?? null,
  };
}
