import { useAtomRefresh, useAtomSet } from "@effect/atom-react";
import type { SearchScope } from "@task-tracker/contracts";
import { Exit } from "effect";
import { useCallback, useRef } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { findSavedSearchAtom, savedSearchesAtom } from "../rpc/saved-search-queries.js";
import { useWorkspaceOrigin } from "../shell/use-workspace-origin.js";
import { dialogStore, notify } from "../state/dialog-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";

interface Origin {
  readonly originProjectId: string | null;
  readonly originFolderId: string | null;
}

/**
 * A project or folder search opens there; an all-projects search keeps the
 * workspace behind it as the origin, so its scope options stay available.
 */
function originFor(scope: typeof SearchScope.Type, workspace: Origin): Origin {
  switch (scope.kind) {
    case "allProjects":
      return workspace;
    case "project":
      return { originProjectId: scope.projectId, originFolderId: null };
    case "area":
      return { originProjectId: scope.projectId, originFolderId: scope.folderId };
  }
}

/**
 * Opens a saved search on the Search page as it is stored now (§7.7). From Search it
 * replaces the page and keeps the original return page. One deleted meanwhile is
 * reported, the lists refresh and the current page stays.
 */
export function useOpenSavedSearch() {
  const find = useAtomSet(findSavedSearchAtom, { mode: "promiseExit" });
  const refreshList = useAtomRefresh(savedSearchesAtom);
  const { originProjectId: workspaceProjectId, originFolderId: workspaceFolderId } =
    useWorkspaceOrigin();
  const opening = useRef(false);

  return useCallback(
    async (savedSearchId: string) => {
      if (opening.current || dialogStore.getState().queue.length > 0) {
        return;
      }
      opening.current = true;
      try {
        const exit = await find({ payload: { savedSearchId } });
        if (Exit.isFailure(exit)) {
          refreshList();
          await notify({ title: "Saved search", message: describeRpcFailure(exit.cause) });
          return;
        }
        const workspace = {
          originProjectId: workspaceProjectId,
          originFolderId: workspaceFolderId,
        };
        const { originProjectId, originFolderId } = originFor(exit.value.scope, workspace);
        useReturnPageStore.getState().openSavedSearch(exit.value, originProjectId, originFolderId);
      } finally {
        opening.current = false;
      }
    },
    [find, refreshList, workspaceProjectId, workspaceFolderId],
  );
}
