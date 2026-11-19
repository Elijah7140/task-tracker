import { useLocation } from "@tanstack/react-router";
import { useCallback } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { useCurrentArea } from "../workspace/area-route.js";

/**
 * Opens Calendar over the current page. From a workspace the calendar starts on
 * that project; from Home or settings it shows all projects (§7.4).
 */
export function useOpenCalendar() {
  const { projectId } = useCurrentArea();
  const pathname = useLocation({ select: (location) => location.pathname });
  const origin = projectId !== undefined && !pathname.endsWith("/settings") ? projectId : null;
  return useCallback(() => {
    if (dialogStore.getState().queue.length === 0) {
      useReturnPageStore.getState().cover("calendar", origin);
    }
  }, [origin]);
}
