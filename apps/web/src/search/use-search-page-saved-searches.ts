import { useAtomValue } from "@effect/atom-react";
import type { SavedSearchDefinition, SavedSearchProjection } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { useRef, useState } from "react";
import { savedSearchesAtom } from "../rpc/saved-search-queries.js";
import { useOpenSavedSearch } from "./use-open-saved-search.js";
import { useSavedSearchActions } from "./use-saved-search-actions.js";

type SavedSearch = typeof SavedSearchProjection.Type;

const NONE: ReadonlyArray<SavedSearch> = [];

/** The saved searches as last loaded, so a refresh never empties the chips. */
function useSavedSearchList() {
  const result = useAtomValue(savedSearchesAtom);
  const last = useRef(NONE);
  if (AsyncResult.isSuccess(result)) {
    last.current = result.value;
  }
  return last.current;
}

/**
 * The Search page's saved searches: the chips, the one currently open and the
 * actions on it (§7.7). Saving asks `definition` for the search as it would run,
 * which shows any query errors and returns null instead.
 */
export function useSearchPageSavedSearches(
  initialId: string | null,
  definition: () => Promise<typeof SavedSearchDefinition.Type | null>,
) {
  const searches = useSavedSearchList();
  const [selectedId, setSelectedId] = useState(initialId);
  const selected = searches.find((search) => search.id === selectedId) ?? null;
  const actions = useSavedSearchActions();
  const saveRef = useRef<HTMLButtonElement>(null);

  const save = async () => {
    const query = await definition();
    const saved = query === null ? null : await actions.save(query, searches, selected);
    if (saved !== null) {
      setSelectedId(saved.id);
    }
  };

  const remove = async () => {
    if (selected !== null && (await actions.delete(selected))) {
      saveRef.current?.focus();
      setSelectedId(null);
    }
  };

  return {
    searches,
    selected,
    saveRef,
    open: useOpenSavedSearch(),
    save,
    rename: async () => {
      if (selected !== null) {
        await actions.rename(selected);
      }
    },
    remove,
  };
}
