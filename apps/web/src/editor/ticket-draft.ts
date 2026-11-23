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
}

/** The ticket values the user changed. Untouched fields are absent. */
export type TicketOverrides = Partial<TicketTexts>;

/** The text fields of a ticket draft, which text and select inputs edit. */
export type TicketTextKey = keyof TicketTexts;

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
  };
}

const orNull = (text: string) => (isBlankText(text) ? null : trimText(text));

/** Whether the ticket draft differs from what is stored, and what saving sends. */
export interface TicketDraftStatus {
  readonly dirty: boolean;
  /** The replacement fields when they changed; undefined keeps the stored ones. */
  readonly ticket: Detail | undefined;
}

/** Compares the typed values with the stored fields. Nothing is sent until they load. */
export function ticketDraftStatus(
  stored: Detail | null,
  overrides: TicketOverrides,
): TicketDraftStatus {
  if (stored === null) {
    return { dirty: false, ticket: undefined };
  }
  const base = storedTicketTexts(stored);
  const texts = { ...base, ...overrides };
  const dirty = (Object.keys(overrides) as Array<keyof TicketTexts>).some(
    (key) => texts[key] !== base[key],
  );
  if (!dirty) {
    return { dirty, ticket: undefined };
  }
  const ticket: Detail = {
    requestorId: orNull(texts.requestorId),
    applicationId: orNull(texts.applicationId),
    moduleId: orNull(texts.moduleId),
    interfaceId: orNull(texts.interfaceId),
    dispatchedToId: orNull(texts.dispatchedToId),
    pendingPersonId: orNull(texts.pendingPersonId),
    ticketTypeId: orNull(texts.ticketTypeId),
  };
  return { dirty, ticket };
}
