import { isBlankText, type TicketDetailInput, trimText } from "@task-tracker/contracts";

type Detail = typeof TicketDetailInput.Type;

/** A ticket's fixed fields in the forms the editor's inputs use; "" means no value (§7.19). */
export interface TicketTexts {
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

/** The ticket values the user changed. Untouched fields are absent. */
export type TicketOverrides = Partial<TicketTexts>;

/** The text fields of a ticket draft, which text and select inputs edit. */
export type TicketTextKey = Exclude<keyof TicketTexts, "isUrgent" | "isSystemOutage">;

const numberText = (value: number | null) => (value === null ? "" : String(value));

/** The stored fields as the inputs show them. */
export function storedTicketTexts(detail: Detail): TicketTexts {
  return {
    requestorId: detail.requestorId ?? "",
    applicationId: detail.applicationId ?? "",
    moduleId: detail.moduleId ?? "",
    interfaceId: detail.interfaceId ?? "",
    dispatchedToId: detail.dispatchedToId ?? "",
    pendingPersonId: detail.pendingPersonId ?? "",
    ticketTypeId: detail.ticketTypeId ?? "",
    version: detail.version ?? "",
    estimatedHours: numberText(detail.estimatedHours),
    percentComplete: numberText(detail.percentComplete),
    isUrgent: detail.isUrgent,
    isSystemOutage: detail.isSystemOutage,
  };
}

const orNull = (text: string) => (isBlankText(text) ? null : trimText(text));

function parseNumber(text: string, label: string) {
  if (isBlankText(text)) {
    return { value: null, error: null };
  }
  const value = Number(trimText(text));
  return Number.isFinite(value)
    ? { value, error: null }
    : { value: null, error: `${label} must be a number.` };
}

/** Whether the ticket draft differs from what is stored, what saving sends, and why it can't. */
export interface TicketDraftStatus {
  readonly dirty: boolean;
  /** The replacement fields when they changed; undefined keeps the stored ones. */
  readonly ticket: Detail | undefined;
  readonly error: string | null;
}

/** Compares the typed values with the stored fields. Nothing is sent until they load. */
export function ticketDraftStatus(
  stored: Detail | null,
  overrides: TicketOverrides,
): TicketDraftStatus {
  if (stored === null) {
    return { dirty: false, ticket: undefined, error: null };
  }
  const base = storedTicketTexts(stored);
  const texts = { ...base, ...overrides };
  const dirty = (Object.keys(overrides) as Array<keyof TicketTexts>).some(
    (key) => texts[key] !== base[key],
  );
  const hours = parseNumber(texts.estimatedHours, "Est. hours");
  const percent = parseNumber(texts.percentComplete, "% complete");
  const error = hours.error ?? percent.error;
  if (!dirty || error !== null) {
    return { dirty, ticket: undefined, error };
  }
  const ticket: Detail = {
    requestorId: orNull(texts.requestorId),
    applicationId: orNull(texts.applicationId),
    moduleId: orNull(texts.moduleId),
    interfaceId: orNull(texts.interfaceId),
    dispatchedToId: orNull(texts.dispatchedToId),
    pendingPersonId: orNull(texts.pendingPersonId),
    ticketTypeId: orNull(texts.ticketTypeId),
    version: orNull(texts.version),
    estimatedHours: hours.value,
    percentComplete: percent.value,
    isUrgent: texts.isUrgent,
    isSystemOutage: texts.isSystemOutage,
  };
  return { dirty, ticket, error: null };
}
