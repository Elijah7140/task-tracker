import { useAtomValue } from "@effect/atom-react";
import type { TicketDetailInput, TicketListEntryProjection } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ticketAtom, ticketListsAtom } from "../rpc/ticket-field-queries.js";
import { DetailRow, DetailSection } from "./detail-rows.js";
import { ParentTicketButton } from "./parent-ticket-link.js";

type Detail = typeof TicketDetailInput.Type;
type Entry = typeof TicketListEntryProjection.Type;

function nameOf(entries: ReadonlyArray<Entry>, id: string | null) {
  if (id === null) {
    return null;
  }
  const entry = entries.find((candidate) => candidate.id === id);
  return entry === undefined ? null : entry.isArchived ? `${entry.name} (archived)` : entry.name;
}

/** "ClockTower › Train › Conversion", from whichever levels the ticket has. */
function levelPath(detail: Detail, entries: ReadonlyArray<Entry>) {
  const names = [detail.applicationId, detail.moduleId, detail.interfaceId]
    .map((id) => nameOf(entries, id))
    .filter((name) => name !== null);
  return names.length === 0 ? null : names.join(" › ");
}

/** The parent ticket's number with the paperclip that opens it (§7.19). */
function ParentTicketRow({ ticketNumber }: { readonly ticketNumber: string | null }) {
  if (ticketNumber === null) {
    return null;
  }
  return (
    <div
      data-testid="details-parent-ticket"
      className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 text-[13px]"
    >
      <dt className="truncate text-fg-muted">Parent ticket</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 break-words text-fg">
        <span className="tabular-nums">#{ticketNumber}</span>
        <ParentTicketButton ticketNumber={ticketNumber} />
      </dd>
    </div>
  );
}

function TicketFields({
  detail,
  entries,
}: {
  readonly detail: Detail;
  readonly entries: ReadonlyArray<Entry>;
}) {
  return (
    <DetailSection title="Ticket" testId="details-ticket">
      <dl className="flex flex-col gap-1.5">
        <ParentTicketRow ticketNumber={detail.parentTicketNumber} />
        <DetailRow label="Requestor" value={nameOf(entries, detail.requestorId)} />
        <DetailRow label="Levels" value={levelPath(detail, entries)} />
        <DetailRow label="Dispatched to" value={nameOf(entries, detail.dispatchedToId)} />
        <DetailRow label="Pending user" value={nameOf(entries, detail.pendingPersonId)} />
        <DetailRow label="Ticket type" value={nameOf(entries, detail.ticketTypeId)} />
      </dl>
    </DetailSection>
  );
}

/** A ticket's fixed fields (§7.19). */
export function TicketDetails({ itemId }: { readonly itemId: string }) {
  const ticket = useAtomValue(ticketAtom(itemId));
  const lists = useAtomValue(ticketListsAtom);
  const entries = AsyncResult.isSuccess(lists) ? lists.value : [];
  return AsyncResult.isSuccess(ticket) ? (
    <TicketFields detail={ticket.value.detail} entries={entries} />
  ) : null;
}
