import { isBlankText, type NewTicketInput, trimText } from "@task-tracker/contracts";
import { type AddItemDraft, buildAddPayload, emptyAddDraft } from "../add/add-item-draft.js";

/** A ticket waiting in the right-hand list of the multi-ticket add view (§7.20). */
export interface BatchEntry {
  /** Stable for the view's lifetime, for React keys and test IDs. */
  readonly key: string;
  readonly draft: AddItemDraft;
  readonly ticket: typeof NewTicketInput.Type;
}

/** The view's form draft and list, and the list row the server last refused. */
export interface TicketBatch {
  readonly draft: AddItemDraft;
  readonly entries: ReadonlyArray<BatchEntry>;
  readonly rejectedKey: string | null;
}

/** The result of Add: the batch with the ticket listed, or why the form cannot be added. */
export type AddEntryResult =
  | { readonly ok: true; readonly batch: TicketBatch }
  | { readonly ok: false; readonly message: string };

/** A blank form at the top level of the chosen area; a parent ticket is only a typed number. */
export const blankBatchDraft = (): AddItemDraft => emptyAddDraft(null);

/** An empty view: a blank form and no listed tickets. */
export const emptyBatch = (): TicketBatch => ({
  draft: blankBatchDraft(),
  entries: [],
  rejectedKey: null,
});

/** Whether the form holds typing that Add has not moved to the list. */
export function hasTyping(draft: AddItemDraft): boolean {
  const blank = blankBatchDraft();
  return (Object.keys(blank) as Array<keyof AddItemDraft>).some(
    (field) => draft[field] !== blank[field],
  );
}

/** Whether closing the view would lose anything: typing in the form or listed tickets. */
export function hasUnsavedTickets(batch: TicketBatch): boolean {
  return batch.entries.length > 0 || hasTyping(batch.draft);
}

/**
 * Checks the form with quick add's rules (§7.19) and moves it to the end of the list,
 * leaving a blank form for the next ticket.
 */
export function addEntry(batch: TicketBatch, key: string): AddEntryResult {
  const built = buildAddPayload("Ticket", batch.draft);
  if (!built.ok) {
    return built;
  }
  const ticket = {
    fields: built.fields,
    ...(built.ticket === undefined ? {} : { ticket: built.ticket }),
  };
  const entry = { key, draft: batch.draft, ticket };
  return {
    ok: true,
    batch: { draft: blankBatchDraft(), entries: [...batch.entries, entry], rejectedKey: null },
  };
}

/** Drops a listed ticket. */
export function removeEntry(batch: TicketBatch, key: string): TicketBatch {
  return {
    ...batch,
    entries: batch.entries.filter((entry) => entry.key !== key),
    rejectedKey: batch.rejectedKey === key ? null : batch.rejectedKey,
  };
}

/**
 * Moves a listed ticket back into the form to change it. Only a blank form takes it,
 * so editing never discards typing; the batch is returned unchanged otherwise.
 */
export function editEntry(batch: TicketBatch, key: string): TicketBatch {
  const entry = batch.entries.find((candidate) => candidate.key === key);
  if (entry === undefined || hasTyping(batch.draft)) {
    return batch;
  }
  return { ...removeEntry(batch, key), draft: entry.draft };
}

/** Marks the listed ticket the server refused, by its position in the Done request. */
export function rejectEntryAt(batch: TicketBatch, index: number): TicketBatch {
  return { ...batch, rejectedKey: batch.entries[index]?.key ?? null };
}

/** "#385405 · Summary", as the add pickers name a ticket. */
export function entryLabel(entry: BatchEntry): string {
  const { ticketNumber, title } = entry.draft;
  const number = trimText(ticketNumber);
  return isBlankText(title) ? `#${number}` : `#${number} · ${trimText(title)}`;
}
