import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { fieldChoicesAtom } from "../rpc/field-queries.js";
import { LoadFailure } from "../ui/load-failure.js";
import { currentDraft, type CustomFieldDraft, storedDisplayValue } from "./custom-field-drafts.js";
import { CustomFieldInput } from "./custom-field-input.js";
import { EditorGroup } from "./editor-group.js";
import type { EditorField } from "./editor-fields.js";
import type { EditorFieldsState } from "./use-editor-fields.js";

/** Props for {@link CustomFieldsSection}. */
export interface CustomFieldsSectionProps {
  readonly state: EditorFieldsState;
  readonly drafts: Readonly<Record<string, CustomFieldDraft>>;
  readonly onChange: (fieldId: string, draft: CustomFieldDraft) => void;
}

function FieldsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading custom fields"
      data-testid="custom-fields-loading"
      className="flex flex-col gap-1.5"
    >
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-8 animate-pulse rounded-control bg-hover" />
      ))}
    </div>
  );
}

function ChoiceDisplay({ field }: { readonly field: EditorField }) {
  const choices = useAtomValue(fieldChoicesAtom(field.definition.id));
  const loaded = AsyncResult.isSuccess(choices) ? choices.value : [];
  return <>{storedDisplayValue(field.definition, field.stored, loaded)}</>;
}

function ArchivedFieldRow({ field }: { readonly field: EditorField }) {
  return (
    <div className="contents" data-testid="archived-field">
      <dt className="truncate text-fg-subtle">{field.definition.displayName}</dt>
      <dd className="truncate text-fg-muted">
        {field.definition.dataType === "Choice" ? (
          <ChoiceDisplay field={field} />
        ) : (
          storedDisplayValue(field.definition, field.stored, [])
        )}
      </dd>
    </div>
  );
}

/** Read-only values of archived fields the item still holds. They are never sent on save. */
function ArchivedFields({ fields }: { readonly fields: ReadonlyArray<EditorField> }) {
  return (
    <EditorGroup title="Archived fields" testId="archived-fields">
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        {fields.map((field) => (
          <ArchivedFieldRow key={field.definition.id} field={field} />
        ))}
      </dl>
    </EditorGroup>
  );
}

/**
 * The item's custom fields with one input per active field, in display order,
 * and archived values listed read-only. Typed drafts win over stored values,
 * so they survive the values loading or refreshing.
 */
export function CustomFieldsSection({ state, drafts, onChange }: CustomFieldsSectionProps) {
  if (state.status === "loading") {
    return (
      <EditorGroup title="Custom fields">
        <FieldsLoading />
      </EditorGroup>
    );
  }
  if (state.status === "failure") {
    return (
      <LoadFailure
        message={state.message}
        onRetry={state.retry}
        testId="custom-fields-load-failure"
      />
    );
  }
  const { active, archived } = state.list;
  return (
    <>
      {active.length === 0 ? null : (
        <EditorGroup title="Custom fields" testId="custom-fields">
          <div className="flex flex-col gap-1.5">
            {active.map((field) => (
              <CustomFieldInput
                key={field.definition.id}
                field={field}
                draft={currentDraft(field.definition, field.stored, drafts[field.definition.id])}
                onChange={(draft) => onChange(field.definition.id, draft)}
              />
            ))}
          </div>
        </EditorGroup>
      )}
      {archived.length === 0 ? null : <ArchivedFields fields={archived} />}
    </>
  );
}
