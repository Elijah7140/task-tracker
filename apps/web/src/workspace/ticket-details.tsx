import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { TicketDetailInput, TicketListEntryProjection } from "@task-tracker/contracts";
import { Exit } from "effect";
import { AsyncResult } from "effect/reactivity";
import { type FormEvent, useState } from "react";
import { formatInstantDate } from "../format/item-dates.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { addTicketCommentAtom } from "../rpc/item-mutations.js";
import { ticketAtom, ticketKey, ticketListsAtom } from "../rpc/ticket-field-queries.js";
import { Button } from "../ui/button.js";
import { fieldStyles } from "../ui/field-styles.js";
import { DetailRow, DetailSection } from "./detail-rows.js";

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

function flags(detail: Detail) {
  const set = [detail.isUrgent ? "Urgent" : null, detail.isSystemOutage ? "System outage" : null];
  const shown = set.filter((flag) => flag !== null);
  return shown.length === 0 ? null : shown.join(", ");
}

function TicketFields({
  detail,
  entries,
}: {
  readonly detail: Detail;
  readonly entries: ReadonlyArray<Entry>;
}) {
  const hours = detail.estimatedHours === null ? null : `${detail.estimatedHours} h`;
  const percent = detail.percentComplete === null ? null : `${detail.percentComplete}%`;
  return (
    <DetailSection title="Ticket" testId="details-ticket">
      <dl className="flex flex-col gap-1.5">
        <DetailRow label="Requestor" value={nameOf(entries, detail.requestorId)} />
        <DetailRow label="Levels" value={levelPath(detail, entries)} />
        <DetailRow label="Dispatched to" value={nameOf(entries, detail.dispatchedToId)} />
        <DetailRow label="Pending user" value={nameOf(entries, detail.pendingPersonId)} />
        <DetailRow label="Ticket type" value={nameOf(entries, detail.ticketTypeId)} />
        <DetailRow label="Version" value={detail.version} />
        <DetailRow label="Est. hours" value={hours} />
        <DetailRow label="% complete" value={percent} />
        <DetailRow label="Flags" value={flags(detail)} />
      </dl>
    </DetailSection>
  );
}

function useAddComment(itemId: string) {
  const add = useAtomSet(addTicketCommentAtom, { mode: "promiseExit" });
  return async (body: string) => {
    const exit = await add({
      payload: { itemId, body },
      reactivityKeys: [ticketKey(itemId), HISTORY_KEY],
    });
    return Exit.isSuccess(exit) ? null : describeRpcFailure(exit.cause);
  };
}

function CommentForm({ itemId }: { readonly itemId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const add = useAddComment(itemId);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || body.trim() === "") {
      return;
    }
    setSaving(true);
    const failure = await add(body);
    setSaving(false);
    setError(failure);
    if (failure === null) {
      setBody("");
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`comment-${itemId}`}>
        New comment
      </label>
      <textarea
        id={`comment-${itemId}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add a comment…"
        rows={3}
        data-testid="ticket-comment-input"
        className={fieldStyles.textarea}
      />
      {error === null ? null : (
        <p role="alert" className={fieldStyles.error}>
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        disabled={saving || body.trim() === ""}
        data-testid="ticket-comment-add"
        className="self-end"
      >
        Add comment
      </Button>
    </form>
  );
}

function Comments({ itemId, timeZone }: { readonly itemId: string; readonly timeZone: string }) {
  const ticket = useAtomValue(ticketAtom(itemId));
  const comments = AsyncResult.isSuccess(ticket) ? ticket.value.comments : [];
  return (
    <DetailSection title="Comments" testId="details-comments">
      <CommentForm itemId={itemId} />
      <ol className="flex flex-col gap-2" data-testid="ticket-comments">
        {comments.map((comment) => (
          <li
            key={comment.id}
            data-testid="ticket-comment"
            className="rounded-control border border-line bg-canvas px-3 py-2"
          >
            <p className="text-xs text-fg-subtle">
              {formatInstantDate(comment.createdAtUtc, timeZone)}
            </p>
            <p className="text-[13px] leading-relaxed whitespace-pre-line">{comment.body}</p>
          </li>
        ))}
      </ol>
    </DetailSection>
  );
}

/** A ticket's fixed fields and its comment log, newest first (§7.19). */
export function TicketDetails({
  itemId,
  timeZone,
}: {
  readonly itemId: string;
  readonly timeZone: string;
}) {
  const ticket = useAtomValue(ticketAtom(itemId));
  const lists = useAtomValue(ticketListsAtom);
  const entries = AsyncResult.isSuccess(lists) ? lists.value : [];
  return (
    <>
      {AsyncResult.isSuccess(ticket) ? (
        <TicketFields detail={ticket.value.detail} entries={entries} />
      ) : null}
      <Comments itemId={itemId} timeZone={timeZone} />
    </>
  );
}
