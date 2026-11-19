import { useLocation } from "@tanstack/react-router";
import { useCallback } from "react";
import { SEARCH_INPUT_TEST_ID } from "../search/search-page.js";
import { dialogStore } from "../state/dialog-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { useCurrentArea } from "../workspace/area-route.js";

/**
 * Opens Search over the current page. From a workspace it defaults to that
 * folder or project; from Home or settings it starts on all projects (§7.2).
 */
export function useOpenSearch() {
  const { projectId, folderId } = useCurrentArea();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isWorkspace = projectId !== undefined && !pathname.endsWith("/settings");
  const originProjectId = isWorkspace ? projectId : null;
  const originFolderId = isWorkspace ? folderId : null;

  return useCallback(() => {
    if (dialogStore.getState().queue.length > 0) {
      return;
    }
    const store = useReturnPageStore.getState();
    if (store.covering === "search") {
      document.querySelector<HTMLInputElement>(`[data-testid="${SEARCH_INPUT_TEST_ID}"]`)?.focus();
      return;
    }
    store.cover("search", originProjectId, originFolderId);
  }, [originProjectId, originFolderId]);
}
