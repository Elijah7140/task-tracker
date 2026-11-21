import type { Ref } from "react";
import {
  DraftArea,
  DraftDate,
  DraftFlag,
  DraftReminder,
  DraftSelect,
  DraftText,
  type DraftProps,
  FieldColumn,
} from "./add-fields.js";
import type { AddItemDraft } from "./add-item-draft.js";
import type { AddLookups } from "./add-lookups.js";
import { entryOptions, moduleOptions, parentOf } from "./ticket-list-options.js";

/** Props for {@link TicketAddFields}. */
export interface TicketAddFieldsProps extends DraftProps {
  readonly detailed: boolean;
  readonly lookups: AddLookups;
  readonly firstFieldRef: Ref<HTMLInputElement>;
  /** Shows Parent ticket in quick add; the tray's multi-ticket add has no parent (§7.20). */
  readonly withParent?: boolean | undefined;
}

type LevelProps = DraftProps & { readonly lookups: AddLookups };

/**
 * Module then Interface. Choosing a module fills in its application and clears an interface
 * from another module; choosing an interface fills in its module (§7.19).
 */
function LevelFields({
  draft,
  onChange,
  lookups,
  withApplication,
}: LevelProps & { readonly withApplication: boolean }) {
  const entries = lookups.ticketLists;
  const onModule = (moduleId: string): Partial<AddItemDraft> => ({
    applicationId: moduleId === "" ? draft.applicationId : parentOf(entries, moduleId),
    interfaceId: parentOf(entries, draft.interfaceId) === moduleId ? draft.interfaceId : "",
  });
  const onApplication = (applicationId: string): Partial<AddItemDraft> =>
    parentOf(entries, draft.moduleId) === applicationId ? {} : { moduleId: "", interfaceId: "" };
  const onInterface = (interfaceId: string): Partial<AddItemDraft> => {
    if (interfaceId === "") {
      return {};
    }
    const moduleId = parentOf(entries, interfaceId);
    return { moduleId, applicationId: parentOf(entries, moduleId) };
  };
  const shared = { draft, onChange };
  return (
    <>
      {withApplication ? (
        <DraftSelect
          {...shared}
          field="applicationId"
          label="Application"
          testId="add-application"
          options={entryOptions(entries, "Application", draft.applicationId)}
          onSelected={onApplication}
        />
      ) : null}
      <DraftSelect
        {...shared}
        field="moduleId"
        label="Module"
        testId="add-module"
        options={moduleOptions(entries, draft.moduleId, withApplication ? draft.applicationId : "")}
        onSelected={onModule}
      />
      <DraftSelect
        {...shared}
        field="interfaceId"
        label="Interface"
        testId="add-interface"
        options={entryOptions(
          entries,
          "Interface",
          draft.interfaceId,
          draft.moduleId === "" ? undefined : draft.moduleId,
        )}
        onSelected={onInterface}
      />
    </>
  );
}

const personOptions = (lookups: AddLookups, selected: string) =>
  entryOptions(lookups.ticketLists, "Person", selected);

/** Quick add's ticket fields, in the owner's order (§7.19). */
function QuickTicketFields({
  lookups,
  firstFieldRef,
  withParent = true,
  ...draft
}: Omit<TicketAddFieldsProps, "detailed">) {
  return (
    <div className="flex flex-col gap-1.5">
      <DraftText
        {...draft}
        field="ticketNumber"
        label="Ticket #"
        testId="add-ticket-number"
        inputRef={firstFieldRef}
      />
      <DraftText {...draft} field="title" label="Summary" testId="add-title" />
      <DraftArea {...draft} field="description" label="Detail" testId="add-description" />
      <LevelFields {...draft} lookups={lookups} withApplication={false} />
      <DraftSelect
        {...draft}
        field="dispatchedToId"
        label="Dispatched to"
        testId="add-dispatched-to"
        options={personOptions(lookups, draft.draft.dispatchedToId)}
      />
      {withParent ? (
        <DraftSelect
          {...draft}
          field="parentItemId"
          label="Parent ticket"
          testId="add-parent"
          options={lookups.parentOptions}
        />
      ) : null}
      <DraftSelect
        {...draft}
        field="priorityLevelId"
        label="Priority"
        testId="add-priority"
        options={lookups.priorityOptions}
      />
    </div>
  );
}

/** Every fixed ticket field except comments, which are added once the ticket exists. */
function DetailedTicketFields({
  lookups,
  firstFieldRef,
  withParent: _withParent,
  ...draft
}: Omit<TicketAddFieldsProps, "detailed">) {
  const people = (selected: string) => personOptions(lookups, selected);
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
      <FieldColumn title="Ticket">
        <DraftText
          {...draft}
          field="ticketNumber"
          label="Ticket #"
          testId="add-ticket-number"
          inputRef={firstFieldRef}
        />
        <DraftText {...draft} field="title" label="Summary" testId="add-title" />
        <DraftArea {...draft} field="description" label="Detail" testId="add-description" />
        <DraftSelect
          {...draft}
          field="requestorId"
          label="Requestor"
          testId="add-requestor"
          options={people(draft.draft.requestorId)}
        />
        <DraftSelect
          {...draft}
          field="parentItemId"
          label="Parent ticket"
          testId="add-parent"
          options={lookups.parentOptions}
        />
        <DraftSelect
          {...draft}
          field="ticketTypeId"
          label="Ticket type"
          testId="add-ticket-type"
          options={entryOptions(lookups.ticketLists, "TicketType", draft.draft.ticketTypeId)}
        />
        <DraftText {...draft} field="version" label="Version" testId="add-version" />
      </FieldColumn>
      <FieldColumn title="Levels">
        <LevelFields {...draft} lookups={lookups} withApplication />
      </FieldColumn>
      <FieldColumn title="Completion">
        <DraftSelect
          {...draft}
          field="dispatchedToId"
          label="Dispatched to"
          testId="add-dispatched-to"
          options={people(draft.draft.dispatchedToId)}
        />
        <DraftText
          {...draft}
          field="estimatedHours"
          label="Est. hours"
          testId="add-estimated-hours"
          inputMode="decimal"
        />
        <DraftText
          {...draft}
          field="percentComplete"
          label="% complete"
          testId="add-percent-complete"
          inputMode="numeric"
        />
        <DraftDate
          {...draft}
          field="dueDate"
          label="Est. comp. date"
          type="date"
          testId="add-due-date"
        />
        <DraftSelect
          {...draft}
          field="priorityLevelId"
          label="Priority"
          testId="add-priority"
          options={lookups.priorityOptions}
        />
        <DraftSelect
          {...draft}
          field="statusId"
          label="Status"
          testId="add-status"
          options={lookups.statusOptions}
        />
        <DraftSelect
          {...draft}
          field="pendingPersonId"
          label="Pending user"
          testId="add-pending-user"
          options={people(draft.draft.pendingPersonId)}
        />
        <DraftReminder {...draft} />
      </FieldColumn>
      <FieldColumn title="Flags">
        <div className="flex flex-col gap-2 pt-1">
          <DraftFlag {...draft} field="isUrgent" testId="add-urgent">
            Urgent
          </DraftFlag>
          <DraftFlag {...draft} field="isSystemOutage" testId="add-system-outage">
            System outage
          </DraftFlag>
        </div>
      </FieldColumn>
    </div>
  );
}

/** The ticket's fields in quick add or the detailed add view. */
export function TicketAddFields({ detailed, ...props }: TicketAddFieldsProps) {
  return detailed ? <DetailedTicketFields {...props} /> : <QuickTicketFields {...props} />;
}
