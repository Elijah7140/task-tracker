import { useMemo, useState } from "react";
import { useReturnPageStore } from "../state/return-page-store.js";
import {
  buildSearchScopeOptions,
  defaultSearchScopeKind,
  type SearchScopeKind,
  toSearchScope,
} from "./search-scope-options.js";

/**
 * The scope Search looks in. It starts at all projects from Home, the project from
 * a workspace root, or the folder from a workspace folder, including subfolders (§7.2).
 */
export function useSearchScope() {
  const originProjectId = useReturnPageStore((state) => state.originProjectId);
  const originFolderId = useReturnPageStore((state) => state.originFolderId);
  const [kind, setKind] = useState<SearchScopeKind>(() =>
    defaultSearchScopeKind(originProjectId, originFolderId),
  );
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
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
