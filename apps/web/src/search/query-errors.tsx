import type { QueryParseError } from "@task-tracker/contracts";
import { CircleAlert } from "lucide-react";

/** The element ID the query box names as its error description. */
export const QUERY_ERRORS_ID = "search-query-errors";

/** Props for {@link QueryErrors}. */
export interface QueryErrorsProps {
  readonly errors: ReadonlyArray<typeof QueryParseError.Type>;
}

/**
 * Every problem in the submitted query text, one per line, each naming the offending
 * token and character (§7.7).
 */
export function QueryErrors({ errors }: QueryErrorsProps) {
  return (
    <div
      id={QUERY_ERRORS_ID}
      role="alert"
      data-testid="search-query-errors"
      className="flex items-start gap-2 rounded-card border border-line bg-danger-soft px-4 py-3 text-[13px] text-danger"
    >
      <CircleAlert size={15} aria-hidden="true" className="mt-px shrink-0" />
      <ul className="flex min-w-0 flex-col gap-1">
        {errors.map((error) => (
          <li key={`${error.position}:${error.message}`} data-testid="search-query-error">
            {error.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
