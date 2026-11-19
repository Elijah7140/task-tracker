import { useParams } from "@tanstack/react-router";

/** A link target for one area: the project root or a folder. */
export type AreaTarget =
  | { readonly to: "/projects/$projectId"; readonly params: { readonly projectId: string } }
  | {
      readonly to: "/projects/$projectId/folders/$folderId";
      readonly params: { readonly projectId: string; readonly folderId: string };
    };

/** The route for an area. A null folder is the project root. */
export function areaTarget(projectId: string, folderId: string | null): AreaTarget {
  return folderId === null
    ? { to: "/projects/$projectId", params: { projectId } }
    : { to: "/projects/$projectId/folders/$folderId", params: { projectId, folderId } };
}

/** The open project and folder from the current route, if a project is open. */
export interface CurrentArea {
  readonly projectId: string | undefined;
  readonly folderId: string | null;
}

/** Reads the open area from the router. IDs are uppercased to match server GUIDs. */
export function useCurrentArea(): CurrentArea {
  const params = useParams({ strict: false });
  return {
    projectId: params.projectId?.toUpperCase(),
    folderId: params.folderId?.toUpperCase() ?? null,
  };
}
