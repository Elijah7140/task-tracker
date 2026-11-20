import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useMemo, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { fieldsAtom } from "../rpc/field-queries.js";
import { Checkbox } from "../ui/checkbox.js";
import { LoadFailure } from "../ui/load-failure.js";
import { SectionCard } from "../ui/section-card.js";
import { AddFieldForm } from "./add-field-form.js";
import type { FieldDataType } from "./field-data-types.js";
import { FieldList } from "./field-list.js";
import { InheritedFields } from "./inherited-fields.js";
import { type FieldDefinition, useFieldActions } from "./use-field-actions.js";

/** Props for {@link FieldManagerCard}. */
export interface FieldManagerCardProps {
  /** The project whose own fields are managed, or `null` for the global fields. */
  readonly projectId: string | null;
}

function useOpenChoicePanels() {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const open = (id: string) => setOpenIds((current) => new Set(current).add(id));
  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  return { openIds, open, toggle };
}

function FieldListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading fields" className="flex flex-col gap-2">
      <div className="h-9 animate-pulse rounded-control bg-hover" />
      <div className="h-9 animate-pulse rounded-control bg-hover" />
    </div>
  );
}

/**
 * Manages the custom fields of one scope: the global fields, or one project's
 * own fields with the inherited global fields listed read-only. Every change
 * saves immediately; choice panels stay open or closed across reloads.
 */
export function FieldManagerCard({ projectId }: FieldManagerCardProps) {
  const isProject = projectId !== null;
  const atom = fieldsAtom(projectId);
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const actions = useFieldActions(projectId);
  const panels = useOpenChoicePanels();
  const [showArchived, setShowArchived] = useState(false);
  const fields = AsyncResult.isSuccess(result) ? result.value : undefined;
  // Keep the reorder lock tied to the loaded rows while the query refreshes.
  const own = useMemo(
    () => fields?.filter((field) => field.projectId === projectId) ?? [],
    [fields, projectId],
  );

  const create = async (name: string, dataType: FieldDataType) => {
    const field = await actions.create(name, dataType);
    if (field?.dataType === "Choice") {
      panels.open(field.id);
    }
    return field;
  };

  const handleTypeChanged = (field: FieldDefinition, dataType: FieldDataType) => {
    if (dataType === "Choice") {
      panels.open(field.id);
    }
  };

  return (
    <SectionCard
      title={isProject ? "Project custom fields" : "Custom fields"}
      description={
        isProject
          ? "Only used in this project. Changes save immediately."
          : "Available in every project. Changes save immediately."
      }
      actions={
        <Checkbox
          checked={showArchived}
          onCheckedChange={setShowArchived}
          testId="field-show-archived"
        >
          Show archived
        </Checkbox>
      }
      testId="field-manager"
    >
      {AsyncResult.isFailure(result) ? (
        <LoadFailure
          message={describeRpcFailure(result.cause)}
          onRetry={refresh}
          testId="field-manager-load-failure"
        />
      ) : AsyncResult.isSuccess(result) ? (
        <>
          <FieldList
            fields={own}
            showArchived={showArchived}
            openChoiceIds={panels.openIds}
            emptyMessage={isProject ? "No project fields yet." : "No custom fields yet."}
            actions={actions}
            onToggleChoices={panels.toggle}
            onTypeChanged={handleTypeChanged}
          />
          <AddFieldForm onCreate={create} />
        </>
      ) : (
        <FieldListSkeleton />
      )}
      {isProject ? <InheritedFields projectId={projectId} /> : null}
    </SectionCard>
  );
}
