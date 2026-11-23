import { useAtomValue } from "@effect/atom-react";
import type { TicketDetailInput, TicketListEntryProjection } from "@task-tracker/contracts";
import { useEffect } from "react";
import { AsyncResult } from "effect/reactivity";
import { entryOptions, moduleOptions, NO_ENTRY, parentOf } from "../add/ticket-list-options.js";
import { ticketAtom, ticketListsAtom } from "../rpc/ticket-field-queries.js";
import { fieldStyles } from "../ui/field-styles.js";
import { Select, type SelectOption } from "../ui/select.js";
import { EditorField } from "./editor-field.js";
import { EditorGroup } from "./editor-group.js";
import {
  storedTicketTexts,
  type TicketOverrides,
  type TicketTextKey,
  type TicketTexts,
} from "./ticket-draft.js";

type Entry = typeof TicketListEntryProjection.Type;

/** Props for {@link TicketSection}. */
export interface TicketSectionProps {
  /** The stored fields with the user's changes applied, or null while they load. */
  readonly texts: TicketTexts | null;
  readonly error: string | null;
  readonly onChange: (change: Partial<TicketTexts>) => void;
}

function EntrySelect({
  label,
  field,
  texts,
  options,
  onChange,
  extra,
}: {
  readonly label: string;
  readonly field: TicketTextKey;
  readonly texts: TicketTexts;
  readonly options: ReadonlyArray<SelectOption<string>>;
  readonly onChange: TicketSectionProps["onChange"];
  readonly extra?: (value: string) => Partial<TicketTexts>;
}) {
  return (
    <EditorField label={label}>
      <Select
        value={texts[field] === "" ? NO_ENTRY : texts[field]}
        onValueChange={(next) => {
          const value = next === NO_ENTRY ? "" : next;
          onChange({ [field]: value, ...extra?.(value) });
        }}
        options={options}
        ariaLabel={label}
        testId={`ticket-editor-${field}`}
        size="sm"
        className="w-full"
      />
    </EditorField>
  );
}

/** Application, Module and Interface, each narrowed to the level above it (§7.19). */
function LevelRows({
  texts,
  entries,
  onChange,
}: {
  readonly texts: TicketTexts;
  readonly entries: ReadonlyArray<Entry>;
  readonly onChange: TicketSectionProps["onChange"];
}) {
  const shared = { texts, onChange };
  return (
    <>
      <EntrySelect
        {...shared}
        label="Application"
        field="applicationId"
        options={entryOptions(entries, "Application", texts.applicationId)}
        extra={(applicationId) =>
          parentOf(entries, texts.moduleId) === applicationId
            ? {}
            : { moduleId: "", interfaceId: "" }
        }
      />
      <EntrySelect
        {...shared}
        label="Module"
        field="moduleId"
        options={moduleOptions(entries, texts.moduleId, texts.applicationId)}
        extra={(moduleId) => ({
          applicationId: moduleId === "" ? texts.applicationId : parentOf(entries, moduleId),
          interfaceId: parentOf(entries, texts.interfaceId) === moduleId ? texts.interfaceId : "",
        })}
      />
      <EntrySelect
        {...shared}
        label="Interface"
        field="interfaceId"
        options={entryOptions(entries, "Interface", texts.interfaceId, texts.moduleId || undefined)}
        extra={(interfaceId) => {
          if (interfaceId === "") {
            return {};
          }
          const moduleId = parentOf(entries, interfaceId);
          return { moduleId, applicationId: parentOf(entries, moduleId) };
        }}
      />
    </>
  );
}

/** The ticket's fixed fields in the editor's properties column (§7.19). */
export function TicketSection({ texts, error, onChange }: TicketSectionProps) {
  const lists = useAtomValue(ticketListsAtom);
  const entries = AsyncResult.isSuccess(lists) ? lists.value : [];
  if (texts === null) {
    return null;
  }
  const people = (selected: string) => entryOptions(entries, "Person", selected);
  const shared = { texts, onChange };
  return (
    <EditorGroup title="Ticket" testId="item-editor-ticket-fields">
      <div className="flex flex-col gap-1.5">
        <EntrySelect
          {...shared}
          label="Requestor"
          field="requestorId"
          options={people(texts.requestorId)}
        />
        <LevelRows texts={texts} entries={entries} onChange={onChange} />
        <EntrySelect
          {...shared}
          label="Dispatched to"
          field="dispatchedToId"
          options={people(texts.dispatchedToId)}
        />
        <EntrySelect
          {...shared}
          label="Pending user"
          field="pendingPersonId"
          options={people(texts.pendingPersonId)}
        />
        <EntrySelect
          {...shared}
          label="Ticket type"
          field="ticketTypeId"
          options={entryOptions(entries, "TicketType", texts.ticketTypeId)}
        />
        {error === null ? null : (
          <p role="alert" className={fieldStyles.error}>
            {error}
          </p>
        )}
      </div>
    </EditorGroup>
  );
}

/**
 * Loads a ticket's stored fields for the editor, reports them to it for comparison and
 * shows them with the user's changes applied.
 */
export function TicketEditorSection({
  itemId,
  overrides,
  error,
  onChange,
  onStored,
}: {
  readonly itemId: string;
  readonly overrides: TicketOverrides;
  readonly error: string | null;
  readonly onChange: TicketSectionProps["onChange"];
  readonly onStored: (detail: typeof TicketDetailInput.Type | null) => void;
}) {
  const ticket = useAtomValue(ticketAtom(itemId));
  const stored = AsyncResult.isSuccess(ticket) ? ticket.value.detail : null;
  useEffect(() => onStored(stored), [stored, onStored]);
  const texts = stored === null ? null : { ...storedTicketTexts(stored), ...overrides };
  return <TicketSection texts={texts} error={error} onChange={onChange} />;
}
