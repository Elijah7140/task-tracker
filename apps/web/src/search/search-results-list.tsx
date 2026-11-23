import { ContextMenu } from "@base-ui/react/context-menu";
import type { ItemSearchResult, ItemSearchResults } from "@task-tracker/contracts";
import { Check, Search } from "lucide-react";
import type { HTMLAttributes, KeyboardEvent } from "react";
import { formatFloatingDate, formatFloatingDateTime } from "../format/item-dates.js";
import { isContextMenuKey, matchesShortcut } from "../ui/keyboard-shortcut.js";
import { ContextMenuContent } from "../ui/menu.js";
import { openContextMenuAt } from "../ui/open-context-menu.js";
import {
  PUSH_BACK_SHORTCUT,
  pushBackReason,
  type PushBackState,
} from "../workspace/push-back-availability.js";
import { PushBackMenuItem } from "../workspace/push-back-menu-item.js";

type Result = typeof ItemSearchResult.Type;

/**
 * Result columns. Below 1024px the fixed widths no longer fit beside the sidebar,
 * down to the legacy 800px minimum window, so every column shares the width
 * proportionally and truncates instead of collapsing the title to nothing.
 */
const COLUMNS = [
  "grid grid-cols-[1.25rem_minmax(0,2fr)_6rem_minmax(0,1.4fr)_5.5rem_6.5rem_9rem] items-center gap-3",
  "max-lg:grid-cols-[1.25rem_minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] max-lg:gap-2",
].join(" ");

/** Props for {@link SearchResultsList}. */
export interface SearchResultsListProps {
  readonly page: typeof ItemSearchResults.Type;
  /** Whether an empty page may say that nothing matched, which waits for a finished search. */
  readonly showEmpty: boolean;
  readonly limit: number;
  readonly onOpen: (itemId: string) => void;
  /** Pushes back a result's item from its row menu or Ctrl+Shift+P (§7.14). */
  readonly onPushBack: (result: Result) => void;
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

const pushBackState = (result: Result): PushBackState => ({
  isCompleted: result.isCompleted,
  hasDates: result.dueDate !== null,
});

interface ResultRowProps {
  readonly result: Result;
  readonly onOpen: (itemId: string) => void;
  readonly onPushBack: (result: Result) => void;
}

/**
 * The Menu key and Shift+F10 open the row menu (§8), and Ctrl+Shift+P pushes
 * back the focused result's item, ignoring a held key's repeats (§7.14).
 */
function rowKeyHandler({ result, onPushBack }: ResultRowProps) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (isContextMenuKey(event)) {
      event.preventDefault();
      openContextMenuAt(event.currentTarget);
    } else if (matchesShortcut(event, PUSH_BACK_SHORTCUT)) {
      event.preventDefault();
      if (!event.repeat && pushBackReason(pushBackState(result)) === null) {
        onPushBack(result);
      }
    }
  };
}

function ResultButton({
  triggerProps,
  ...props
}: ResultRowProps & { readonly triggerProps: HTMLAttributes<HTMLElement> }) {
  const { result, onOpen } = props;
  const cell = "truncate text-xs text-fg-muted";
  return (
    <button
      {...triggerProps}
      type="button"
      data-testid="search-result-row"
      data-item-id={result.itemId}
      onClick={() => onOpen(result.itemId)}
      onKeyDown={rowKeyHandler(props)}
      aria-keyshortcuts="Control+Shift+P"
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

/** One result: activation opens the item, and right-click opens its row menu. */
function ResultRow(props: ResultRowProps) {
  const { result, onPushBack } = props;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={(triggerProps: HTMLAttributes<HTMLElement>) => (
          <ResultButton {...props} triggerProps={triggerProps} />
        )}
      />
      <ContextMenuContent testId="search-result-menu">
        <PushBackMenuItem state={pushBackState(result)} onPushBack={() => onPushBack(result)} />
      </ContextMenuContent>
    </ContextMenu.Root>
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
      <span className="truncate">Title</span>
      <span className="truncate">Ticket</span>
      <span className="truncate">Location</span>
      <span className="truncate">Type</span>
      <span className="truncate">Priority</span>
      <span className="truncate">Due</span>
    </div>
  );
}

/**
 * One page of results. Clicking a row, or Enter or Space on it, opens the item
 * (§7.2). Its row menu offers Push back one day (§7.14).
 */
export function SearchResultsList({
  page,
  showEmpty,
  limit,
  onOpen,
  onPushBack,
}: SearchResultsListProps) {
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
          <ResultRow key={result.itemId} result={result} onOpen={onOpen} onPushBack={onPushBack} />
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
