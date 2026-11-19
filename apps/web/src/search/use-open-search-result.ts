import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import type { SearchItemLocation } from "@task-tracker/contracts";
import { Exit } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { locateSearchItemAtom } from "../rpc/search-queries.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";

type Location = typeof SearchItemLocation.Type;

/** Shown when a result's item was deleted after the search ran. */
export const MISSING_ITEM_MESSAGE = "This item no longer exists";

/** Queues focus on the item, which its area expands, selects and focuses once it renders. */
function followItem(location: Location) {
  const workspace = useWorkspaceStore.getState();
  workspace.setPendingRowFocus({
    itemId: location.itemId,
    areaKey: areaKey(location.projectId, location.folderId),
  });
  useReturnPageStore.getState().uncover();
}

function areaRoute({ projectId, folderId }: Location) {
  return folderId === null
    ? ({ to: "/projects/$projectId", params: { projectId } } as const)
    : ({ to: "/projects/$projectId/folders/$folderId", params: { projectId, folderId } } as const);
}

/**
 * Opens a result in the area that holds it now. Unsaved drafts behind Search are
 * asked first, and Cancel stays on Search. One activation runs at a time, and one
 * still pending when Search closes does nothing (§7.2).
 */
export function useOpenSearchResult(runGuards: ReturnGuard) {
  const navigate = useNavigate();
  const locate = useAtomSet(locateSearchItemAtom, { mode: "promiseExit" });
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const openLocated = useCallback(
    async (itemId: string) => {
      const exit = await locate({ payload: { itemId } });
      if (!mounted.current) {
        return;
      }
      if (Exit.isFailure(exit)) {
        setError(describeRpcFailure(exit.cause));
      } else if (exit.value === null) {
        setError(MISSING_ITEM_MESSAGE);
      } else {
        followItem(exit.value);
        await navigate(areaRoute(exit.value));
      }
    },
    [locate, navigate],
  );

  const open = useCallback(
    async (itemId: string) => {
      if (pending.current) {
        return;
      }
      pending.current = true;
      setError(null);
      try {
        if ((await runGuards()) && mounted.current) {
          await openLocated(itemId);
        }
      } finally {
        pending.current = false;
      }
    },
    [openLocated, runGuards],
  );
  return { open, error, clearError: () => setError(null) };
}
