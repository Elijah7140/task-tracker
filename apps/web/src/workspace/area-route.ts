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

/** A link target for a drilled-in item (§7.19). */
export type ItemTarget =
  | {
      readonly to: "/projects/$projectId/items/$itemId";
      readonly params: { readonly projectId: string; readonly itemId: string };
    }
  | {
      readonly to: "/projects/$projectId/folders/$folderId/items/$itemId";
      readonly params: {
        readonly projectId: string;
        readonly folderId: string;
        readonly itemId: string;
      };
    };

/** The route that opens an item: its children as cards and its details beside them. */
export function itemTarget(projectId: string, folderId: string | null, itemId: string): ItemTarget {
  return folderId === null
    ? { to: "/projects/$projectId/items/$itemId", params: { projectId, itemId } }
    : {
        to: "/projects/$projectId/folders/$folderId/items/$itemId",
        params: { projectId, folderId, itemId },
      };
}

/** The open project, folder and drilled-in item from the current route. */
export interface CurrentArea {
  readonly projectId: string | undefined;
  readonly folderId: string | null;
  /** The item whose children show as cards, or null for the area itself (§7.19). */
  readonly itemId: string | null;
}

/** Reads the open area from the router. IDs are uppercased to match server GUIDs. */
export function useCurrentArea(): CurrentArea {
  const params = useParams({ strict: false });
  return {
    projectId: params.projectId?.toUpperCase(),
    folderId: params.folderId?.toUpperCase() ?? null,
    itemId: params.itemId?.toUpperCase() ?? null,
  };
}
