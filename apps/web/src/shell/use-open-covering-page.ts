import { useLocation } from "@tanstack/react-router";
import { useCallback } from "react";
import { SEARCH_INPUT_TEST_ID } from "../search/search-page.js";
import { dialogStore } from "../state/dialog-store.js";
import { type CoveringPage, useReturnPageStore } from "../state/return-page-store.js";
import { useCurrentArea } from "../workspace/area-route.js";

/**
 * Opens a covering page with the current workspace as its origin. Home and
 * settings have no workspace scope. Opening Search again focuses its text box.
 */
export function useOpenCoveringPage() {
  const { projectId, folderId } = useCurrentArea();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isWorkspace = projectId !== undefined && !pathname.endsWith("/settings");
  const originProjectId = isWorkspace ? projectId : null;
  const originFolderId = isWorkspace ? folderId : null;

  return useCallback(
    (page: CoveringPage) => {
      if (dialogStore.getState().queue.length > 0) {
        return;
      }
      const store = useReturnPageStore.getState();
      if (page === "search" && store.covering === page) {
        document
          .querySelector<HTMLInputElement>(`[data-testid="${SEARCH_INPUT_TEST_ID}"]`)
          ?.focus();
        return;
      }
      store.cover(page, originProjectId, originFolderId);
    },
    [originProjectId, originFolderId],
  );
}
