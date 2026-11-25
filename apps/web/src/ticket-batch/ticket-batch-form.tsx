import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Plus } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import type { AddItemDraft } from "../add/add-item-draft.js";
import type { AddLookups } from "../add/add-lookups.js";
import { TicketAddFields } from "../add/ticket-add-fields.js";
import { lookupOptions } from "../editor/editor-options.js";
import { priorityLevelsAtom } from "../rpc/lookup-queries.js";
import { ticketListsAtom } from "../rpc/ticket-field-queries.js";
import { Button } from "../ui/button.js";

/** The pickers the tray's form offers: quick add's ticket lists and priorities (§7.20). */
function useBatchLookups(): AddLookups {
  const lists = useAtomValue(ticketListsAtom);
  const priorities = useAtomValue(priorityLevelsAtom);
  return {
    priorityOptions: lookupOptions(AsyncResult.isSuccess(priorities) ? priorities.value : [], null),
    statusOptions: [],
    parentOptions: [],
    ticketLists: AsyncResult.isSuccess(lists) ? lists.value : [],
  };
}

/** Props for {@link TicketBatchForm}. */
export interface TicketBatchFormProps {
  readonly draft: AddItemDraft;
  readonly onChange: (change: Partial<AddItemDraft>) => void;
  readonly onAdd: () => void;
  readonly error: string | null;
  readonly firstFieldRef: RefObject<HTMLInputElement | null>;
}

/**
 * The left column: quick add's ticket fields without Parent ticket, and Add, which moves
 * the ticket to the list. Enter in a single-line box adds too, as in quick add (§7.19).
 */
export function TicketBatchForm({
  draft,
  onChange,
  onAdd,
  error,
  firstFieldRef,
}: TicketBatchFormProps) {
  const lookups = useBatchLookups();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAdd();
  };
  return (
    <form
      aria-label="New ticket"
      data-testid="ticket-batch-form"
      onSubmit={submit}
      noValidate
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">
        <TicketAddFields
          draft={draft}
          onChange={onChange}
          detailed={false}
          lookups={lookups}
          firstFieldRef={firstFieldRef}
        />
      </div>
      <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
        <p
          role="alert"
          data-testid={error === null ? undefined : "ticket-batch-form-error"}
          className="mr-auto min-w-0 text-[13px] text-danger"
        >
          {error}
        </p>
        <Button type="submit" data-testid="ticket-batch-add">
          <Plus size={14} aria-hidden="true" />
          Add
        </Button>
      </footer>
    </form>
  );
}
