import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import type { AreaSnapshot, Item } from "@task-tracker/contracts";
import type { Ref } from "react";
import { fieldStyles } from "../ui/field-styles.js";
import { Select } from "../ui/select.js";
import { ClearableInput } from "./clearable-input.js";
import { DescriptionField } from "./description-field.js";
import { EditorField } from "./editor-field.js";
import { EditorGroup } from "./editor-group.js";
import { lookupOptions, NONE_VALUE } from "./editor-options.js";
import type { BuiltInKey, BuiltInTexts } from "./item-draft.js";

type Snapshot = typeof AreaSnapshot.Type;

/** Props for {@link TitleFields} and {@link PropertyFields}. */
export interface BuiltInFieldsProps {
  readonly item: typeof Item.Type;
  readonly texts: BuiltInTexts;
  readonly itemTypes: Snapshot["itemTypes"];
  readonly priorityLevels: Snapshot["priorityLevels"];
  readonly statuses: Snapshot["statuses"];
  readonly titleRef: Ref<HTMLInputElement>;
  readonly onChange: (key: BuiltInKey, value: string) => void;
}

/** True for a ticket, whose fields are fixed: no type and only one date (§7.19). */
const isTicket = (item: typeof Item.Type) => item.kind === "Ticket";

type ChangeProps = Pick<BuiltInFieldsProps, "texts" | "onChange">;

/** The item's title, edited in place as the panel's heading, and its description. */
export function TitleFields({
  texts,
  onChange,
  titleRef,
  placeholder = "Untitled",
}: ChangeProps &
  Pick<BuiltInFieldsProps, "titleRef"> & { readonly placeholder?: string | undefined }) {
  return (
    <div className="flex flex-col gap-3">
      <Field.Root className="flex flex-col">
        <Field.Label className="sr-only">Title</Field.Label>
        <Input
          ref={titleRef}
          value={texts.title}
          onValueChange={(value: string) => onChange("title", value)}
          placeholder={placeholder}
          data-testid="item-editor-title"
          autoComplete="off"
          className="h-10 rounded-control border border-transparent bg-transparent px-2 -mx-2 text-xl font-semibold tracking-tight text-fg outline-none placeholder:text-fg-subtle hover:bg-hover focus-visible:border-accent focus-visible:bg-canvas focus-visible:ring-3 focus-visible:ring-focus"
        />
      </Field.Root>
      <DescriptionField
        value={texts.description}
        onChange={(value) => onChange("description", value)}
      />
    </div>
  );
}

function LookupSelect({
  label,
  value,
  options,
  testId,
  onValueChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: ReturnType<typeof lookupOptions>;
  readonly testId: string;
  readonly onValueChange: (value: string) => void;
}) {
  return (
    <EditorField label={label}>
      <Select
        value={value === "" ? NONE_VALUE : value}
        onValueChange={(next) => onValueChange(next === NONE_VALUE ? "" : next)}
        options={options}
        ariaLabel={label}
        testId={testId}
        size="sm"
        className="w-full"
      />
    </EditorField>
  );
}

function DetailsGroup({
  item,
  texts,
  itemTypes,
  priorityLevels,
  statuses,
  onChange,
}: Omit<BuiltInFieldsProps, "titleRef">) {
  return (
    <EditorGroup title="Details" testId="item-editor-details">
      <div className="flex flex-col gap-1.5">
        {isTicket(item) ? null : (
          <LookupSelect
            label="Type"
            value={texts.itemTypeId}
            options={lookupOptions(itemTypes, item.itemTypeId)}
            testId="item-editor-type"
            onValueChange={(value) => onChange("itemTypeId", value)}
          />
        )}
        <LookupSelect
          label="Priority"
          value={texts.priorityLevelId}
          options={lookupOptions(priorityLevels, item.priorityLevelId)}
          testId="item-editor-priority"
          onValueChange={(value) => onChange("priorityLevelId", value)}
        />
        <LookupSelect
          label="Status"
          value={texts.statusId}
          options={lookupOptions(statuses, item.statusId)}
          testId="item-editor-status"
          onValueChange={(value) => onChange("statusId", value)}
        />
        <EditorField label="Ticket number">
          <Input
            value={texts.ticketNumber}
            onValueChange={(value: string) => onChange("ticketNumber", value)}
            data-testid="item-editor-ticket"
            autoComplete="off"
            spellCheck={false}
            className={fieldStyles.compactControl}
          />
        </EditorField>
      </div>
    </EditorGroup>
  );
}

interface DateInput {
  readonly key: BuiltInKey;
  readonly label: string;
  readonly type: "date" | "time";
  readonly testId: string;
}

/** A ToDo has a due date and an optional due time (§7.4). */
const TODO_DATE_INPUTS: ReadonlyArray<DateInput> = [
  { key: "dueDate", label: "Due date", type: "date", testId: "due-date" },
  { key: "dueTime", label: "Due time", type: "time", testId: "due-time" },
];

/** A ticket's only date is its estimated completion date, stored as the due date (§7.19). */
const TICKET_DATE_INPUTS: ReadonlyArray<DateInput> = [
  { key: "dueDate", label: "Est. comp. date", type: "date", testId: "due-date" },
];

function ScheduleGroup({ texts, onChange, ticket }: ChangeProps & { readonly ticket: boolean }) {
  return (
    <EditorGroup title="Schedule" testId="item-editor-schedule">
      <div className="flex flex-col gap-1.5">
        {(ticket ? TICKET_DATE_INPUTS : TODO_DATE_INPUTS).map((input) => (
          <EditorField key={input.key} label={input.label}>
            <ClearableInput
              type={input.type}
              value={texts[input.key]}
              onValueChange={(value) => onChange(input.key, value)}
              clearLabel={`Clear ${input.label.toLowerCase()}`}
              testId={`item-editor-${input.testId}`}
              clearTestId={`item-editor-clear-${input.testId}`}
            />
          </EditorField>
        ))}
      </div>
    </EditorGroup>
  );
}

/**
 * The item's built-in metadata as compact property rows: Details (type,
 * priority, ticket) and Schedule (due date and time).
 */
export function PropertyFields(props: Omit<BuiltInFieldsProps, "titleRef">) {
  return (
    <>
      <DetailsGroup {...props} />
      <ScheduleGroup texts={props.texts} onChange={props.onChange} ticket={isTicket(props.item)} />
    </>
  );
}
