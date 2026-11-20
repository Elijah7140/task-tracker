import type { ItemQuery, SavedSearchProjection } from "@task-tracker/contracts";
import { useEffect, useRef, useState } from "react";
import type { LoadedQuery } from "./use-search-query.js";

/** Options for {@link useSavedSearchLoad}. */
export interface SavedSearchLoadOptions {
  readonly savedSearch: typeof SavedSearchProjection.Type | null;
  /** True once the scope's fields loaded or failed, so the rows can be rebuilt. */
  readonly ready: boolean;
  readonly load: (stored: string) => Promise<LoadedQuery>;
  readonly onRun: (query: typeof ItemQuery.Type) => void;
}

/**
 * Applies the saved search Search opened with once its scope's fields are known and
 * runs it. A saved search that no longer fits, such as one naming an archived field,
 * a deleted choice or a deleted project, reports why instead of results (§7.7).
 */
export function useSavedSearchLoad({ savedSearch, ready, load, onRun }: SavedSearchLoadOptions) {
  const [loading, setLoading] = useState(savedSearch !== null);
  const [stale, setStale] = useState<string | null>(null);
  const started = useRef(false);
  const latest = useRef({ load, onRun });
  latest.current = { load, onRun };

  useEffect(() => {
    if (savedSearch === null || !ready || started.current) {
      return;
    }
    started.current = true;
    void latest.current.load(savedSearch.queryText).then((result) => {
      setLoading(false);
      if (result.kind === "run") {
        latest.current.onRun(result.query);
      } else if (result.kind === "stale") {
        setStale(`The saved search '${savedSearch.name}' can't be run. ${result.reason}`);
      }
    });
  }, [savedSearch, ready]);

  return { loading, stale, clearStale: () => setStale(null) };
}
