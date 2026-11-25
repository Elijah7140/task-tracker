import {
  isBlankText,
  trimText,
  type ItemEdit,
  type ReminderChoice,
  type TicketDetailInput,
} from "@task-tracker/contracts";

/** The kinds of item the add buttons create (§7.19). */
export type AddKind = "Todo" | "Ticket";

/**
 * What the add dialog holds while the user types, as text so inputs stay controlled.
 * An empty string means "no value". Quick add and the detailed view share one draft,
 * so switching views keeps what was typed.
 */
export interface AddItemDraft {
  /** The ToDo's Description or the ticket's Summary: the item's main line. */
  readonly title: string;
  /** The ticket's Detail; a ToDo has none (§7.19). */
  readonly description: string;
  /** The item's Markdown notes. */
  readonly notes: string;
  readonly ticketNumber: string;
  /** The card the item is added under: its place in the tree, not its parent ticket. */
  readonly parentItemId: string;
  /** A ticket's parent ticket number, typed freely (§7.19). */
  readonly parentTicketNumber: string;
  readonly priorityLevelId: string;
  readonly statusId: string;
  readonly dueDate: string;
  readonly dueTime: string;
  /** "default", "none" or an offset in minutes, as the editor's reminder picker uses. */
  readonly reminder: string;
  readonly requestorId: string;
  readonly applicationId: string;
  readonly moduleId: string;
  readonly interfaceId: string;
  readonly dispatchedToId: string;
  readonly pendingPersonId: string;
  readonly ticketTypeId: string;
}

/** The text fields of a draft, which every text input edits. */
export type AddDraftTextKey = {
  [Key in keyof AddItemDraft]: AddItemDraft[Key] extends string ? Key : never;
}[keyof AddItemDraft];

/**
 * A blank draft placed under `parentItemId`, or at the level's top when it is empty. A
 * ticket added under a ticket starts with that ticket's number as its parent ticket.
 */
export function emptyAddDraft(
  parentItemId: string | null,
  parentTicketNumber: string | null = null,
): AddItemDraft {
  return {
    title: "",
    description: "",
    notes: "",
    ticketNumber: "",
    parentItemId: parentItemId ?? "",
    parentTicketNumber: parentTicketNumber ?? "",
    priorityLevelId: "",
    statusId: "",
    dueDate: "",
    dueTime: "",
    reminder: "default",
    requestorId: "",
    applicationId: "",
    moduleId: "",
    interfaceId: "",
    dispatchedToId: "",
    pendingPersonId: "",
    ticketTypeId: "",
  };
}

/** The AddItem payload fields a draft produces, or the first reason it cannot be saved. */
export type AddPayload =
  | {
      readonly ok: true;
      readonly parentItemId: string | null;
      readonly fields: typeof ItemEdit.Type;
      readonly reminder: typeof ReminderChoice.Type;
      readonly ticket: typeof TicketDetailInput.Type | undefined;
    }
  | { readonly ok: false; readonly message: string };

const orNull = (text: string) => (isBlankText(text) ? null : text);

/** A time input gives `HH:mm`; the wire wants seconds too. */
const withSeconds = (time: string) => (time.length === 5 ? `${time}:00` : time);

const timeOrNull = (text: string) => (isBlankText(text) ? null : withSeconds(text));

function reminderChoice(value: string): typeof ReminderChoice.Type {
  if (value === "default" || value === "none") {
    return { kind: value };
  }
  return { kind: "offset", minutes: Number(value) };
}

function itemFields(kind: AddKind, draft: AddItemDraft): typeof ItemEdit.Type {
  const todo = kind === "Todo";
  return {
    title: draft.title,
    description: todo ? null : orNull(draft.description),
    notes: orNull(draft.notes),
    ticketNumber: todo ? null : orNull(draft.ticketNumber),
    priorityLevelId: orNull(draft.priorityLevelId),
    statusId: orNull(draft.statusId),
    dueDate: orNull(draft.dueDate),
    dueTime: draft.dueDate === "" ? null : timeOrNull(draft.dueTime),
  };
}

function ticketFields(draft: AddItemDraft): typeof TicketDetailInput.Type {
  return {
    requestorId: orNull(draft.requestorId),
    applicationId: orNull(draft.applicationId),
    moduleId: orNull(draft.moduleId),
    interfaceId: orNull(draft.interfaceId),
    dispatchedToId: orNull(draft.dispatchedToId),
    pendingPersonId: orNull(draft.pendingPersonId),
    ticketTypeId: orNull(draft.ticketTypeId),
    parentTicketNumber: orNull(trimText(draft.parentTicketNumber)),
  };
}

/** The first rule the dialog checks before sending, matching the server's own messages. */
function missingField(kind: AddKind, draft: AddItemDraft): string | null {
  if (kind === "Ticket" && isBlankText(draft.ticketNumber)) {
    return "A ticket needs a ticket number.";
  }
  if (isBlankText(draft.title)) {
    return kind === "Ticket" ? "Enter a summary." : "Enter a description.";
  }
  return null;
}

/** Builds the AddItem fields from a draft. The server applies every other rule. */
export function buildAddPayload(kind: AddKind, draft: AddItemDraft): AddPayload {
  const missing = missingField(kind, draft);
  if (missing !== null) {
    return { ok: false, message: missing };
  }
  const ticket = kind === "Ticket" ? ticketFields(draft) : undefined;
  return {
    ok: true,
    parentItemId: orNull(draft.parentItemId),
    fields: itemFields(kind, draft),
    reminder: reminderChoice(draft.reminder),
    ticket,
  };
}
