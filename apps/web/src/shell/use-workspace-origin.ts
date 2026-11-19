import { useLocation } from "@tanstack/react-router";
import { useCurrentArea } from "../workspace/area-route.js";

/**
 * The workspace project and folder behind a covering page, which become its scope
 * origin. Home and settings have no workspace scope.
 */
export function useWorkspaceOrigin() {
  const { projectId, folderId } = useCurrentArea();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isWorkspace = projectId !== undefined && !pathname.endsWith("/settings");
  return {
    originProjectId: isWorkspace ? projectId : null,
    originFolderId: isWorkspace ? folderId : null,
  };
}
