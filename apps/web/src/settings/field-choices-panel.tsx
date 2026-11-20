import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { ChevronRight } from "lucide-react";
import { useId } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { fieldChoicesAtom } from "../rpc/field-queries.js";
import { cx } from "../ui/class-names.js";
import { LoadFailure } from "../ui/load-failure.js";
import { AddChoiceForm } from "./add-choice-form.js";
import { FieldChoiceList } from "./field-choice-list.js";
import type { FieldDefinition } from "./use-field-actions.js";
import { useFieldChoiceActions } from "./use-field-choice-actions.js";

/** Props for {@link FieldChoicesPanel}. */
export interface FieldChoicesPanelProps {
  readonly field: FieldDefinition;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly showArchived: boolean;
}

/**
 * The expandable choices panel of one choice field. The header counts active
 * choices; archived fields list their choices but take no new ones.
 */
export function FieldChoicesPanel({
  field,
  expanded,
  onToggle,
  showArchived,
}: FieldChoicesPanelProps) {
  const panelId = useId();
  const atom = fieldChoicesAtom(field.id);
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const actions = useFieldChoiceActions(field.id);
  const choices = AsyncResult.isSuccess(result) ? result.value : [];
  const activeCount = choices.filter((choice) => !choice.isArchived).length;
  const header = AsyncResult.isSuccess(result) ? `Choices (${activeCount})` : "Choices";

  return (
    <div className="pr-1.5 pb-2.5 pl-8">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        data-testid="field-choices-toggle"
        onClick={onToggle}
        className="inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-[13px] font-medium text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={cx("transition-transform duration-100", expanded && "rotate-90")}
        />
        {header}
      </button>
      {expanded ? (
        <div
          id={panelId}
          className="mt-1 flex flex-col gap-2 rounded-control border border-line bg-canvas p-2"
        >
          {AsyncResult.isFailure(result) ? (
            <LoadFailure message={describeRpcFailure(result.cause)} onRetry={refresh} />
          ) : (
            <FieldChoiceList
              fieldName={field.displayName}
              choices={choices}
              showArchived={showArchived}
              actions={actions}
            />
          )}
          {field.isArchived ? null : (
            <AddChoiceForm fieldName={field.displayName} onAdd={actions.add} />
          )}
        </div>
      ) : null}
    </div>
  );
}
