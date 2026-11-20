import {
  isBlankText,
  type ItemEdit,
  type ReminderChoice,
  type TicketDetailInput,
  trimText,
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
  /** The ToDo's Notes or the ticket's Detail. */
  readonly description: string;
  readonly ticketNumber: string;
  readonly parentItemId: string;
  readonly priorityLevelId: string;
  readonly statusId: string;
  readonly itemTypeId: string;
  readonly dueDate: string;
  readonly dueTime: string;
  readonly scheduledStart: string;
  readonly scheduledEnd: string;
  /** "default", "none" or an offset in minutes, as the editor's reminder picker uses. */
  readonly reminder: string;
  readonly requestorId: string;
  readonly applicationId: string;
  readonly moduleId: string;
  readonly interfaceId: string;
  readonly dispatchedToId: string;
  readonly pendingPersonId: string;
  readonly ticketTypeId: string;
  readonly version: string;
  readonly estimatedHours: string;
  readonly percentComplete: string;
  readonly isUrgent: boolean;
  readonly isSystemOutage: boolean;
}

/** The text fields of a draft, which every text input edits. */
export type AddDraftTextKey = {
  [Key in keyof AddItemDraft]: AddItemDraft[Key] extends string ? Key : never;
}[keyof AddItemDraft];

/** A blank draft placed under `parentItemId`, or at the level's top when it is empty. */
export function emptyAddDraft(parentItemId: string | null): AddItemDraft {
  return {
    title: "",
    description: "",
    ticketNumber: "",
    parentItemId: parentItemId ?? "",
    priorityLevelId: "",
    statusId: "",
    itemTypeId: "",
    dueDate: "",
    dueTime: "",
    scheduledStart: "",
    scheduledEnd: "",
    reminder: "default",
    requestorId: "",
    applicationId: "",
    moduleId: "",
    interfaceId: "",
    dispatchedToId: "",
    pendingPersonId: "",
    ticketTypeId: "",
    version: "",
    estimatedHours: "",
    percentComplete: "",
    isUrgent: false,
    isSystemOutage: false,
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

const floatingDateTime = (text: string) => (isBlankText(text) ? null : withSeconds(text));

function reminderChoice(value: string): typeof ReminderChoice.Type {
  if (value === "default" || value === "none") {
    return { kind: value };
  }
  return { kind: "offset", minutes: Number(value) };
}

/** A typed number, or null for a blank box. `error` explains text that is not a number. */
function parseOptionalNumber(text: string, label: string) {
  if (isBlankText(text)) {
    return { value: null, error: null };
  }
  const value = Number(trimText(text));
  return Number.isFinite(value)
    ? { value, error: null }
    : { value: null, error: `${label} must be a number.` };
}

function itemFields(kind: AddKind, draft: AddItemDraft): typeof ItemEdit.Type {
  const todo = kind === "Todo";
  return {
    title: draft.title,
    description: orNull(draft.description),
    ticketNumber: orNull(draft.ticketNumber),
    itemTypeId: todo ? orNull(draft.itemTypeId) : null,
    priorityLevelId: orNull(draft.priorityLevelId),
    statusId: orNull(draft.statusId),
    dueDate: orNull(draft.dueDate),
    dueTime: draft.dueDate === "" ? null : floatingDateTime(draft.dueTime),
    scheduledStart: todo ? floatingDateTime(draft.scheduledStart) : null,
    scheduledEnd: todo ? floatingDateTime(draft.scheduledEnd) : null,
  };
}

function ticketFields(
  draft: AddItemDraft,
): { readonly ticket: typeof TicketDetailInput.Type } | { readonly error: string } {
  const hours = parseOptionalNumber(draft.estimatedHours, "Est. hours");
  const percent = parseOptionalNumber(draft.percentComplete, "% complete");
  const error = hours.error ?? percent.error;
  if (error !== null) {
    return { error };
  }
  return {
    ticket: {
      requestorId: orNull(draft.requestorId),
      applicationId: orNull(draft.applicationId),
      moduleId: orNull(draft.moduleId),
      interfaceId: orNull(draft.interfaceId),
      dispatchedToId: orNull(draft.dispatchedToId),
      pendingPersonId: orNull(draft.pendingPersonId),
      ticketTypeId: orNull(draft.ticketTypeId),
      version: orNull(draft.version),
      estimatedHours: hours.value,
      percentComplete: percent.value,
      isUrgent: draft.isUrgent,
      isSystemOutage: draft.isSystemOutage,
    },
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
  if (ticket !== undefined && "error" in ticket) {
    return { ok: false, message: ticket.error };
  }
  return {
    ok: true,
    parentItemId: orNull(draft.parentItemId),
    fields: itemFields(kind, draft),
    reminder: reminderChoice(draft.reminder),
    ticket: ticket?.ticket,
  };
}
