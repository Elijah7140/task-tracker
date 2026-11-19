import type { SearchScope } from "@task-tracker/contracts";
import { useMemo, useState } from "react";
import { useReturnPageStore } from "../state/return-page-store.js";
import {
  buildSearchScopeOptions,
  defaultSearchScopeKind,
  type SearchScopeKind,
  searchScopeKind,
  toSearchScope,
} from "./search-scope-options.js";

/**
 * The scope Search looks in. It starts at all projects from Home, the project from
 * a workspace root, or the folder from a workspace folder, including subfolders (§7.2).
 * A saved search starts in its own `initial` scope instead (§7.7).
 */
export function useSearchScope(initial?: typeof SearchScope.Type) {
  const originProjectId = useReturnPageStore((state) => state.originProjectId);
  const originFolderId = useReturnPageStore((state) => state.originFolderId);
  const [kind, setKind] = useState<SearchScopeKind>(() =>
    initial === undefined
      ? defaultSearchScopeKind(originProjectId, originFolderId)
      : searchScopeKind(initial),
  );
  const [includeSubfolders, setIncludeSubfolders] = useState(
    () => initial?.kind !== "area" || initial.includeSubfolders,
  );
  const options = useMemo(
    () => buildSearchScopeOptions(originProjectId, originFolderId),
    [originProjectId, originFolderId],
  );
  const scope = useMemo(
    () => toSearchScope(kind, originProjectId, originFolderId, includeSubfolders),
    [kind, originProjectId, originFolderId, includeSubfolders],
  );
  return { options, kind, setKind, includeSubfolders, setIncludeSubfolders, scope };
}
