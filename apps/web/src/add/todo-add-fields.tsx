import type { Ref } from "react";
import {
  DraftArea,
  DraftDate,
  DraftReminder,
  DraftSelect,
  DraftText,
  type DraftProps,
  FieldColumn,
} from "./add-fields.js";
import type { AddLookups } from "./add-lookups.js";
import { CustomFieldDrafts, type CustomDraftsProps } from "./custom-field-drafts.js";

/** Props for {@link TodoAddFields}. */
export interface TodoAddFieldsProps extends DraftProps {
  readonly detailed: boolean;
  readonly lookups: AddLookups;
  readonly firstFieldRef: Ref<HTMLInputElement>;
  readonly custom: CustomDraftsProps;
}

/** Quick add's four ToDo fields: Description, Priority, Due date and time, Reminder (§7.19). */
function QuickTodoFields({
  lookups,
  firstFieldRef,
  ...draft
}: Omit<TodoAddFieldsProps, "detailed" | "custom">) {
  return (
    <div className="flex flex-col gap-1.5">
      <DraftText
        {...draft}
        field="title"
        label="Description"
        testId="add-title"
        inputRef={firstFieldRef}
      />
      <DraftSelect
        {...draft}
        field="priorityLevelId"
        label="Priority"
        testId="add-priority"
        options={lookups.priorityOptions}
      />
      <DraftDate {...draft} field="dueDate" label="Due date" type="date" testId="add-due-date" />
      <DraftDate {...draft} field="dueTime" label="Due time" type="time" testId="add-due-time" />
      <DraftReminder {...draft} />
    </div>
  );
}

/**
 * The ToDo's fields: quick add's four, or the detailed view with notes, type, status,
 * parent, the scheduled block and the custom fields from the field manager.
 */
export function TodoAddFields(props: TodoAddFieldsProps) {
  const { detailed, lookups, firstFieldRef, custom, ...draft } = props;
  if (!detailed) {
    return <QuickTodoFields {...draft} lookups={lookups} firstFieldRef={firstFieldRef} />;
  }
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
      <FieldColumn title="ToDo">
        <DraftText
          {...draft}
          field="title"
          label="Description"
          testId="add-title"
          inputRef={firstFieldRef}
        />
        <DraftArea {...draft} field="description" label="Notes" testId="add-description" />
        <DraftSelect
          {...draft}
          field="parentItemId"
          label="Parent"
          testId="add-parent"
          options={lookups.parentOptions}
        />
        <DraftSelect
          {...draft}
          field="itemTypeId"
          label="Type"
          testId="add-type"
          options={lookups.typeOptions}
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
      </FieldColumn>
      <FieldColumn title="Schedule">
        <DraftDate {...draft} field="dueDate" label="Due date" type="date" testId="add-due-date" />
        <DraftDate {...draft} field="dueTime" label="Due time" type="time" testId="add-due-time" />
        <DraftDate
          {...draft}
          field="scheduledStart"
          label="Scheduled start"
          type="datetime-local"
          testId="add-scheduled-start"
        />
        <DraftDate
          {...draft}
          field="scheduledEnd"
          label="Scheduled end"
          type="datetime-local"
          testId="add-scheduled-end"
        />
        <DraftReminder {...draft} />
      </FieldColumn>
      <div className="md:col-span-2">
        <CustomFieldDrafts {...custom} />
      </div>
    </div>
  );
}
