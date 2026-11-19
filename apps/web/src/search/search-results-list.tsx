import type { ItemSearchResult, ItemSearchResults } from "@task-tracker/contracts";
import { Check, Search } from "lucide-react";
import { formatFloatingDate, formatFloatingDateTime } from "../format/item-dates.js";

type Result = typeof ItemSearchResult.Type;

const COLUMNS =
  "grid grid-cols-[1.25rem_minmax(0,2fr)_6rem_minmax(0,1.4fr)_5.5rem_6.5rem_9rem] items-center gap-3";

/** Props for {@link SearchResultsList}. */
export interface SearchResultsListProps {
  readonly page: typeof ItemSearchResults.Type;
  /** Whether an empty page may say that nothing matched, which waits for a finished search. */
  readonly showEmpty: boolean;
  readonly limit: number;
  readonly onOpen: (itemId: string) => void;
}

function dueText({ dueDate, dueTime }: Result): string {
  if (dueDate === null) {
    return "";
  }
  return dueTime === null ? formatFloatingDate(dueDate) : formatFloatingDateTime(dueDate, dueTime);
}

function NoMatches() {
  return (
    <div
      data-testid="search-empty"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-14 text-center"
    >
      <span className="grid size-10 place-items-center rounded-card bg-hover text-fg-muted">
        <Search size={20} aria-hidden="true" />
      </span>
      <p className="text-[15px] font-medium">No items match</p>
      <p className="text-sm text-fg-muted">Try widening the scope or changing the filters.</p>
    </div>
  );
}

function ResultTitle({ result }: { readonly result: Result }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={
          result.isCompleted ? "truncate text-fg-muted line-through" : "truncate font-medium"
        }
      >
        {result.title}
      </span>
      {result.statusName === null ? null : (
        <span
          data-testid="search-result-status"
          className="shrink-0 rounded-full border border-line bg-hover px-2 py-0.5 text-[11px] font-medium text-fg-muted"
        >
          {result.statusName}
        </span>
      )}
    </span>
  );
}

function ResultRow({
  result,
  onOpen,
}: {
  readonly result: Result;
  readonly onOpen: (itemId: string) => void;
}) {
  const cell = "truncate text-xs text-fg-muted";
  return (
    <button
      type="button"
      data-testid="search-result-row"
      data-item-id={result.itemId}
      onClick={() => onOpen(result.itemId)}
      className={`${COLUMNS} px-3 py-2 text-left text-sm transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus`}
    >
      <span className="flex items-center justify-center text-fg-subtle">
        {result.isCompleted ? <Check size={14} aria-label="Completed" /> : null}
      </span>
      <ResultTitle result={result} />
      <span className={`${cell} font-mono`}>{result.ticketNumber ?? ""}</span>
      <span className={cell}>{result.location.join(" › ")}</span>
      <span className={cell}>{result.typeName ?? ""}</span>
      <span className={cell}>{result.priorityLabel ?? ""}</span>
      <span className={cell}>{dueText(result)}</span>
    </button>
  );
}

function ResultsHeader() {
  return (
    <div
      aria-hidden="true"
      data-testid="search-results-header"
      className={`${COLUMNS} px-3 text-xs font-medium text-fg-subtle`}
    >
      <span>✓</span>
      <span>Title</span>
      <span>Ticket</span>
      <span>Location</span>
      <span>Type</span>
      <span>Priority</span>
      <span>Due</span>
    </div>
  );
}

/** One page of results. Clicking a row, or Enter or Space on it, opens the item (§7.2). */
export function SearchResultsList({ page, showEmpty, limit, onOpen }: SearchResultsListProps) {
  if (page.items.length === 0) {
    return showEmpty ? <NoMatches /> : null;
  }
  return (
    <section aria-label="Results" className="flex flex-col gap-2">
      <ResultsHeader />
      <div
        data-testid="search-results-list"
        className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
      >
        {page.items.map((result) => (
          <ResultRow key={result.itemId} result={result} onOpen={onOpen} />
        ))}
      </div>
      {page.hasMore ? (
        <p data-testid="search-has-more" className="text-xs text-fg-muted">
          Showing the first {limit} matches — narrow your search
        </p>
      ) : null}
    </section>
  );
}
