import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { effectiveFieldsAtom } from "../rpc/field-queries.js";
import { FieldTypeIcon } from "./field-type-icon.js";

/**
 * The read-only list of active global fields a project inherits, read from the
 * same effective-field query that item pickers use.
 */
export function InheritedFields({ projectId }: { readonly projectId: string }) {
  const result = useAtomValue(effectiveFieldsAtom(projectId));
  const inherited = AsyncResult.isSuccess(result)
    ? result.value.filter((field) => field.projectId === null)
    : [];

  return (
    <div data-testid="field-inherited" className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-semibold">Global fields (inherited)</h3>
        <p className="text-[13px] text-fg-muted">
          Available in this project. Manage them in{" "}
          <Link to="/settings" className="text-accent-text hover:underline">
            App Settings
          </Link>
          .
        </p>
      </div>
      {AsyncResult.isFailure(result) ? (
        <p role="alert" className="text-[13px] text-danger">
          {describeRpcFailure(result.cause)}
        </p>
      ) : inherited.length === 0 ? (
        <p className="px-1.5 text-[13px] text-fg-subtle">
          {AsyncResult.isSuccess(result) ? "No global fields." : "Loading…"}
        </p>
      ) : (
        <ul aria-label="Inherited global fields" className="flex flex-col">
          {inherited.map((field) => (
            <li
              key={field.id}
              aria-label={field.displayName}
              data-testid="field-inherited-row"
              className="flex h-9 items-center gap-1.5 border-b border-line px-1.5 last:border-b-0"
            >
              <span aria-hidden="true" className="size-6 shrink-0" />
              <FieldTypeIcon dataType={field.dataType} />
              <span className="truncate text-sm text-fg">{field.displayName}</span>
              <span className="ml-auto shrink-0 text-[13px] text-fg-subtle">{field.dataType}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
