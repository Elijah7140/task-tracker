import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { SavedSearchProjection } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { Bookmark, Pencil, Trash2 } from "lucide-react";
import { useRef } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { savedSearchesAtom } from "../rpc/saved-search-queries.js";
import { useOpenSavedSearch } from "../search/use-open-saved-search.js";
import { useSavedSearchActions } from "../search/use-saved-search-actions.js";
import { Button } from "../ui/button.js";
import { LoadFailure } from "../ui/load-failure.js";

type SavedSearch = typeof SavedSearchProjection.Type;

const HEADING_ID = "home-saved-searches-heading";
const ROW_ATTRIBUTE = "data-saved-search-id";

interface RowProps {
  readonly search: SavedSearch;
  readonly onOpen: (search: SavedSearch) => void;
  readonly onRename: (search: SavedSearch) => void;
  readonly onDelete: (search: SavedSearch) => void;
}

function SavedSearchRow({ search, onOpen, onRename, onDelete }: RowProps) {
  return (
    <li className="flex items-center gap-2 py-1.5 pr-2 pl-3">
      <Bookmark size={14} aria-hidden="true" className="shrink-0 text-fg-subtle" />
      <button
        type="button"
        data-saved-search-id={search.id}
        data-testid="saved-search-link"
        className="min-w-0 flex-1 cursor-default truncate rounded-control py-1 text-left font-medium text-accent-text outline-offset-2 hover:underline"
        onClick={() => onOpen(search)}
      >
        {search.name}
      </button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Rename saved search '${search.name}'`}
        data-testid="saved-search-rename"
        onClick={() => onRename(search)}
      >
        <Pencil size={13} aria-hidden="true" />
        Rename
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Delete saved search '${search.name}'`}
        data-testid="saved-search-delete"
        onClick={() => onDelete(search)}
      >
        <Trash2 size={13} aria-hidden="true" />
        Delete
      </Button>
    </li>
  );
}

/** After a deletion, focus the next search's link, else the previous one, else New project. */
function focusAfterDelete(list: HTMLElement | null, rows: ReadonlyArray<SavedSearch>, id: string) {
  const index = rows.findIndex((search) => search.id === id);
  const neighbour = rows[index + 1] ?? rows[index - 1];
  const target =
    neighbour === undefined
      ? document.querySelector<HTMLElement>('[data-testid="new-project-button"]')
      : list?.querySelector<HTMLElement>(`[${ROW_ATTRIBUTE}="${neighbour.id}"]`);
  target?.focus();
}

function SavedSearchList({ rows }: { readonly rows: ReadonlyArray<SavedSearch> }) {
  const listRef = useRef<HTMLUListElement>(null);
  const open = useOpenSavedSearch();
  const actions = useSavedSearchActions();
  const remove = async (search: SavedSearch) => {
    if (await actions.delete(search)) {
      focusAfterDelete(listRef.current, rows, search.id);
    }
  };
  return (
    <ul
      ref={listRef}
      className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface shadow-card"
    >
      {rows.map((search) => (
        <SavedSearchRow
          key={search.id}
          search={search}
          onOpen={(chosen) => void open(chosen.id)}
          onRename={(chosen) => void actions.rename(chosen)}
          onDelete={(chosen) => void remove(chosen)}
        />
      ))}
    </ul>
  );
}

/**
 * Home's saved searches in stored order, each opening Search with its query, plus
 * Rename and Delete (§7.7). Hidden while there are none.
 */
export function SavedSearchesSection() {
  const result = useAtomValue(savedSearchesAtom);
  const refresh = useAtomRefresh(savedSearchesAtom);
  if (AsyncResult.isFailure(result)) {
    return (
      <LoadFailure
        message={describeRpcFailure(result.cause)}
        onRetry={refresh}
        testId="home-saved-searches-failure"
      />
    );
  }
  if (!AsyncResult.isSuccess(result) || result.value.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid="home-saved-searches"
      className="mt-10 flex flex-col gap-3"
    >
      <h2 id={HEADING_ID} className="text-[15px] font-semibold tracking-tight">
        Saved searches
      </h2>
      <SavedSearchList rows={result.value} />
    </section>
  );
}
