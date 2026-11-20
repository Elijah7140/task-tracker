import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { FieldDefinitionProjection, FieldValueInput } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import {
  type CustomFieldDraft,
  draftError,
  draftInput,
  storedDraft,
} from "../editor/custom-field-drafts.js";
import { CustomFieldInput } from "../editor/custom-field-input.js";
import { EditorGroup } from "../editor/editor-group.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { effectiveFieldsAtom } from "../rpc/field-queries.js";
import { LoadFailure } from "../ui/load-failure.js";

type Definition = typeof FieldDefinitionProjection.Type;

/** Props for {@link CustomFieldDrafts}. */
export interface CustomDraftsProps {
  readonly projectId: string;
  readonly drafts: Readonly<Record<string, CustomFieldDraft>>;
  readonly onChange: (fieldId: string, draft: CustomFieldDraft) => void;
}

/**
 * The project's active custom fields for a new ToDo, one input each (§7.1). Tickets have fixed
 * fields, so this shows for ToDos only.
 */
export function CustomFieldDrafts({ projectId, drafts, onChange }: CustomDraftsProps) {
  const atom = effectiveFieldsAtom(projectId);
  const fields = useAtomValue(atom);
  const retry = useAtomRefresh(atom);
  if (AsyncResult.isFailure(fields)) {
    return <LoadFailure message={describeRpcFailure(fields.cause)} onRetry={retry} />;
  }
  if (!AsyncResult.isSuccess(fields) || fields.value.length === 0) {
    return null;
  }
  return (
    <EditorGroup title="Custom fields" testId="add-custom-fields">
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
        {fields.value.map((definition) => (
          <CustomFieldInput
            key={definition.id}
            field={{ definition, stored: undefined }}
            draft={drafts[definition.id] ?? storedDraft(definition, undefined)}
            onChange={(draft) => onChange(definition.id, draft)}
          />
        ))}
      </div>
    </EditorGroup>
  );
}

/** True when a typed custom value cannot be saved, such as a number that does not parse. */
export function hasCustomDraftErrors(drafts: Readonly<Record<string, CustomFieldDraft>>) {
  return Object.values(drafts).some((draft) => draftError(draft) !== null);
}

/** The values a new item saves: only the fields the user filled in. */
export function customValueInputs(
  definitions: ReadonlyArray<Definition>,
  drafts: Readonly<Record<string, CustomFieldDraft>>,
): ReadonlyArray<typeof FieldValueInput.Type> {
  return definitions.flatMap((definition) => {
    const draft = drafts[definition.id];
    if (draft === undefined) {
      return [];
    }
    const input = draftInput(definition, draft);
    const hasValue = Object.entries(input).some(
      ([key, value]) => key !== "fieldDefinitionId" && value !== null && value !== undefined,
    );
    return hasValue ? [input] : [];
  });
}
