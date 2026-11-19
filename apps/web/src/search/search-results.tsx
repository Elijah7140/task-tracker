import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { ItemQuery, ItemSearchResults } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { SEARCH_RESULT_LIMIT, searchResultsAtom } from "../rpc/search-queries.js";
import { SearchError } from "./search-error.js";
import { SearchResultsList } from "./search-results-list.js";

type Page = typeof ItemSearchResults.Type;

/** Props for {@link SearchResults}. */
export interface SearchResultsProps {
  readonly query: typeof ItemQuery.Type;
  /** Increases each time the user searches, so repeating a query runs it again. */
  readonly run: number;
  readonly onOpen: (itemId: string) => void;
}

/**
 * Runs the same query again when the user repeats a search, but not on first render.
 * A new query loads through its own atom, so a new run of it needs no refresh.
 */
function useRepeatRun(atom: unknown, run: number, refresh: () => void) {
  const shown = useRef({ atom, run });
  useEffect(() => {
    const repeated = shown.current.atom === atom && shown.current.run !== run;
    shown.current = { atom, run };
    if (repeated) {
      refresh();
    }
  }, [atom, run, refresh]);
}

/** Keeps the last page on screen while a newer search is still running. */
function useLastPage(result: AsyncResult.AsyncResult<Page, unknown>) {
  const last = useRef<Page | null>(null);
  if (AsyncResult.isSuccess(result)) {
    last.current = result.value;
  }
  return AsyncResult.isSuccess(result) ? result.value : last.current;
}

/**
 * The results of a submitted search, read through a query atom per query, so a
 * newer search replaces an older one and undo or redo refreshes the page (§7.2).
 */
export function SearchResults({ query, run, onOpen }: SearchResultsProps) {
  const atom = searchResultsAtom(query);
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  useRepeatRun(atom, run, refresh);
  const page = useLastPage(result);
  const busy = result.waiting || AsyncResult.isInitial(result);
  return (
    <>
      {AsyncResult.isFailure(result) ? (
        <SearchError message={describeRpcFailure(result.cause)} />
      ) : null}
      {busy ? (
        <p role="status" data-testid="search-busy" className="text-sm text-fg-muted">
          Searching…
        </p>
      ) : null}
      {page === null ? null : (
        <SearchResultsList
          page={page}
          showEmpty={!busy && AsyncResult.isSuccess(result)}
          limit={SEARCH_RESULT_LIMIT}
          onOpen={onOpen}
        />
      )}
    </>
  );
}
