import { Input } from "@base-ui/react/input";
import { useAtomValue } from "@effect/atom-react";
import {
  isBlankText,
  type TicketListEntryProjection,
  type TicketListKind,
} from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { ticketListsAtom } from "../rpc/ticket-field-queries.js";
import { UNSAVED_SETTINGS_UNDO_MESSAGE, useUndoBlocker } from "../shell/undo-blockers.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { SectionCard } from "../ui/section-card.js";
import {
  LIST_NOUNS,
  siblingsOf,
  type TicketListActions,
  useTicketListActions,
} from "./use-ticket-list-actions.js";

type Entry = typeof TicketListEntryProjection.Type;
type Kind = typeof TicketListKind.Type;

const CHILD_KIND: Partial<Record<Kind, Kind>> = { Application: "Module", Module: "Interface" };

function AddEntryForm({
  label,
  testId,
  onAdd,
}: {
  readonly label: string;
  readonly testId: string;
  readonly onAdd: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  useUndoBlocker(!isBlankText(name), UNSAVED_SETTINGS_UNDO_MESSAGE);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isBlankText(name) && (await onAdd(name))) {
      setName("");
    }
  };
  return (
    <form className="flex items-center gap-2" onSubmit={(event) => void submit(event)}>
      <Input
        value={name}
        onValueChange={setName}
        placeholder={label}
        aria-label={label}
        autoComplete="off"
        data-testid={testId}
        className="h-7 min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus"
      />
      <Button type="submit" size="sm" data-testid={`${testId}-add`}>
        Add
      </Button>
    </form>
  );
}

function RowButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function EntryRow({
  entry,
  index,
  count,
  actions,
}: {
  readonly entry: Entry;
  readonly index: number;
  readonly count: number;
  readonly actions: TicketListActions;
}) {
  const { name, isArchived } = entry;
  return (
    <div
      data-testid="ticket-list-row"
      className="group flex h-8 items-center gap-1 rounded-control pr-1 pl-2 hover:bg-hover"
    >
      <span
        className={cx(
          "min-w-0 flex-1 truncate text-[13px]",
          isArchived && "text-fg-subtle line-through",
        )}
      >
        {name}
      </span>
      {isArchived ? (
        <RowButton label={`Restore ${name}`} onClick={() => void actions.setArchived(entry, false)}>
          <ArchiveRestore size={13} aria-hidden="true" />
        </RowButton>
      ) : (
        <>
          <RowButton
            label={`Move ${name} up`}
            disabled={index === 0}
            onClick={() => void actions.move(entry, -1)}
          >
            <ArrowUp size={13} aria-hidden="true" />
          </RowButton>
          <RowButton
            label={`Move ${name} down`}
            disabled={index === count - 1}
            onClick={() => void actions.move(entry, 1)}
          >
            <ArrowDown size={13} aria-hidden="true" />
          </RowButton>
          <RowButton label={`Rename ${name}`} onClick={() => void actions.rename(entry)}>
            <Pencil size={13} aria-hidden="true" />
          </RowButton>
          <RowButton
            label={`Archive ${name}`}
            onClick={() => void actions.setArchived(entry, true)}
          >
            <Archive size={13} aria-hidden="true" />
          </RowButton>
        </>
      )}
    </div>
  );
}

/** One list level with its rows, each level below it nested under its parent row. */
function ListLevel({
  entries,
  kind,
  parentId,
  actions,
}: {
  readonly entries: ReadonlyArray<Entry>;
  readonly kind: Kind;
  readonly parentId: string | null;
  readonly actions: TicketListActions;
}) {
  const rows = siblingsOf(entries, kind, parentId);
  const childKind = CHILD_KIND[kind];
  const noun = LIST_NOUNS[kind];
  return (
    <div className="flex flex-col gap-1" data-testid={`ticket-list-${kind.toLowerCase()}`}>
      <ul className="flex flex-col gap-px">
        {rows.map((entry, index) => (
          <li key={entry.id}>
            <EntryRow entry={entry} index={index} count={rows.length} actions={actions} />
            {childKind === undefined || entry.isArchived ? null : (
              <div className="ml-4 border-l border-line pl-3">
                <ListLevel
                  entries={entries}
                  kind={childKind}
                  parentId={entry.id}
                  actions={actions}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <AddEntryForm
        label={
          parentId === null
            ? `New ${noun}`
            : `New ${noun} under ${entries.find((entry) => entry.id === parentId)?.name ?? ""}`
        }
        testId={`ticket-list-new-${kind.toLowerCase()}`}
        onAdd={(name) => actions.add(kind, parentId, name)}
      />
    </div>
  );
}

function ListSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The lists that ticket fields choose from (§7.19): People for Requestor, Dispatched to and
 * Pending user; Ticket types; and the ticket levels, where each Application holds Modules
 * and each Module holds Interfaces.
 */
export function TicketListsCard() {
  const lists = useAtomValue(ticketListsAtom);
  const entries = AsyncResult.isSuccess(lists) ? lists.value : [];
  const actions = useTicketListActions(entries);
  return (
    <SectionCard
      title="Ticket lists"
      description="People, ticket types and the Application › Module › Interface levels that tickets choose from."
      testId="ticket-lists-card"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ListSection title="People">
          <ListLevel entries={entries} kind="Person" parentId={null} actions={actions} />
        </ListSection>
        <ListSection title="Ticket types">
          <ListLevel entries={entries} kind="TicketType" parentId={null} actions={actions} />
        </ListSection>
        <ListSection title="Ticket levels">
          <ListLevel entries={entries} kind="Application" parentId={null} actions={actions} />
        </ListSection>
      </div>
    </SectionCard>
  );
}
