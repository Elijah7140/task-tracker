import type {
  FieldValueInput,
  TicketDetailInput,
  Item,
  ItemEdit,
  ItemLinkInput,
  RecurrenceRule,
  ReminderChoice,
} from "@task-tracker/contracts";
import {
  currentDraft,
  type CustomFieldDraft,
  draftError,
  draftInput,
  isDraftChanged,
} from "./custom-field-drafts.js";
import type { EditorField } from "./editor-fields.js";
import {
  type BuiltInOverrides,
  draftTexts,
  isBuiltInDraftChanged,
  itemEdit,
} from "./item-draft.js";
import {
  EMPTY_LINK_DRAFT,
  type LinkDraft,
  linkDraftStatus,
  type StoredLink,
} from "./link-draft.js";
import { isReminderChanged } from "./reminder-draft.js";
import { type RepeatDraft, repeatDate, repeatDraftStatus } from "./repeat-draft.js";
import { type TicketOverrides, ticketDraftStatus } from "./ticket-draft.js";

/** Everything the editor holds for one item, typed and stored. */
export interface EditorDraftInput {
  readonly item: typeof Item.Type;
  readonly builtIn: BuiltInOverrides;
  readonly custom: Readonly<Record<string, CustomFieldDraft>>;
  /** The active custom fields, or null while they load. */
  readonly activeFields: ReadonlyArray<EditorField> | null;
  /** The Links section's draft; absent means untouched. */
  readonly links?: LinkDraft;
  /** The stored links, or null (the default) while they load. */
  readonly storedLinks?: ReadonlyArray<StoredLink> | null;
  /** The Repeat section's draft; absent or null means untouched. */
  readonly repeat?: RepeatDraft | null;
  /** The Reminder choice; absent or null means untouched. */
  readonly reminder?: typeof ReminderChoice.Type | null;
  /** A ticket's stored fixed fields, null while they load, and the user's changes (§7.19). */
  readonly ticket?: {
    readonly stored: typeof TicketDetailInput.Type | null;
    readonly overrides: TicketOverrides;
  };
}

/** Whether the draft can be saved and what saving it sends. */
export interface EditorDraftStatus {
  readonly dirty: boolean;
  /** False while any typed custom value cannot be parsed, which blocks saving. */
  readonly valid: boolean;
  readonly fields: typeof ItemEdit.Type;
  /** Only the active custom fields whose draft differs from the stored value. */
  readonly customValues: ReadonlyArray<typeof FieldValueInput.Type>;
  /** The whole replacement link list when it changed, including text left in the boxes. */
  readonly links: ReadonlyArray<typeof ItemLinkInput.Type> | undefined;
  /** Why text left in the link boxes cannot be added, which refuses the save. */
  readonly linkEntryProblem: string | null;
  /** The replacement repeat rule; undefined keeps the stored one (§7.11). */
  readonly recurrence: typeof RecurrenceRule.Type | null | undefined;
  /** Why the shown repeat rule cannot be saved, which refuses the save. */
  readonly repeatError: string | null;
  /** The shown repeat rule in plain English. */
  readonly repeatSummary: string | null;
  /** The replacement reminder choice; undefined keeps the stored one (§7.12). */
  readonly reminder: typeof ReminderChoice.Type | undefined;
  /** A ticket's replacement fixed fields; undefined keeps the stored ones (§7.19). */
  readonly ticket: typeof TicketDetailInput.Type | undefined;
}

/** Shown when a save is attempted while a custom value cannot be parsed. */
export const FIX_FIELDS_MESSAGE = "Fix the custom field values marked in red first.";

function typedFields(input: EditorDraftInput) {
  return (input.activeFields ?? []).flatMap((field) => {
    const typed = input.custom[field.definition.id];
    if (typed === undefined) {
      return [];
    }
    return [{ field, draft: currentDraft(field.definition, field.stored, typed) }];
  });
}

/**
 * Compares the draft with the stored item and fields. Archived fields are
 * never sent, and untouched fields keep whatever is stored, even if another
 * client changed it meanwhile.
 */
export function editorDraftStatus(input: EditorDraftInput): EditorDraftStatus {
  const changed = typedFields(input).filter(({ field, draft }) =>
    isDraftChanged(field.definition, draft, field.stored),
  );
  const links = linkDraftStatus(input.storedLinks ?? null, input.links ?? EMPTY_LINK_DRAFT);
  const date = repeatDate(draftTexts(input.item, input.builtIn));
  const repeat = repeatDraftStatus(input.item, input.repeat ?? null, date);
  const reminderDraft = input.reminder ?? null;
  const reminderChanged = isReminderChanged(input.item, reminderDraft);
  const ticket = ticketDraftStatus(input.ticket?.stored ?? null, input.ticket?.overrides ?? {});
  return {
    dirty:
      isBuiltInDraftChanged(input.item, input.builtIn) ||
      changed.length > 0 ||
      links.dirty ||
      repeat.changed ||
      reminderChanged ||
      ticket.dirty,
    valid: changed.every(({ draft }) => draftError(draft) === null),
    fields: itemEdit(input.item, input.builtIn),
    customValues: changed.map(({ field, draft }) => draftInput(field.definition, draft)),
    links: links.links,
    linkEntryProblem: links.entryProblem,
    recurrence: repeat.recurrence,
    repeatError: repeat.error,
    repeatSummary: repeat.summary,
    reminder: reminderChanged && reminderDraft !== null ? reminderDraft : undefined,
    ticket: ticket.ticket,
  };
}
