import type { FieldValueInput, Item, ItemEdit } from "@task-tracker/contracts";
import {
  currentDraft,
  type CustomFieldDraft,
  draftError,
  draftInput,
  isDraftChanged,
} from "./custom-field-drafts.js";
import type { EditorField } from "./editor-fields.js";
import { type BuiltInOverrides, isBuiltInDraftChanged, itemEdit } from "./item-draft.js";

/** Everything the editor holds for one item, typed and stored. */
export interface EditorDraftInput {
  readonly item: typeof Item.Type;
  readonly builtIn: BuiltInOverrides;
  readonly custom: Readonly<Record<string, CustomFieldDraft>>;
  /** The active custom fields, or null while they load. */
  readonly activeFields: ReadonlyArray<EditorField> | null;
}

/** Whether the draft can be saved and what saving it sends. */
export interface EditorDraftStatus {
  readonly dirty: boolean;
  /** False while any typed custom value cannot be parsed, which blocks saving. */
  readonly valid: boolean;
  readonly fields: typeof ItemEdit.Type;
  /** Only the active custom fields whose draft differs from the stored value. */
  readonly customValues: ReadonlyArray<typeof FieldValueInput.Type>;
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
  return {
    dirty: isBuiltInDraftChanged(input.item, input.builtIn) || changed.length > 0,
    valid: changed.every(({ draft }) => draftError(draft) === null),
    fields: itemEdit(input.item, input.builtIn),
    customValues: changed.map(({ field, draft }) => draftInput(field.definition, draft)),
  };
}
