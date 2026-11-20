import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { ProjectWorkspace } from "@task-tracker/contracts";
import { Navigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { ListPlus, TicketPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAddItemStore } from "../add/add-item-store.js";
import { areaAtom } from "../rpc/area-queries.js";
import { Button } from "../ui/button.js";
import { findItemNode, itemAncestorIds } from "./item-outline.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { projectWorkspaceAtom } from "../rpc/project-queries.js";
import { serverInfoAtom } from "../rpc/server-info-query.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { AreaItems } from "./area-items.js";
import { areaTarget, useCurrentArea } from "./area-route.js";
import { useUnavailableProjectRedirect } from "./use-unavailable-project-redirect.js";
import { WorkspaceBreadcrumbs } from "./workspace-breadcrumbs.js";

interface WorkspaceAreaProps {
  readonly workspace: typeof ProjectWorkspace.Type;
  readonly folderId: string | null;
  readonly itemId: string | null;
  readonly timeZone: string;
}

/** The drilled-in item and its ancestors, top-level first, once the area has loaded (§7.19). */
function useItemPath(projectId: string, folderId: string | null, itemId: string | null) {
  const area = useAtomValue(areaAtom(projectId, folderId));
  if (itemId === null || !AsyncResult.isSuccess(area)) {
    return [];
  }
  const { items } = area.value;
  return [...itemAncestorIds(items, itemId), itemId].flatMap((id) => {
    const node = findItemNode(items, id);
    return node === undefined ? [] : [{ id, title: node.item.title }];
  });
}

/** New ToDo and New Ticket for the open level: the area, or the drilled-in item (§7.19). */
function AddButtons({ parentItemId }: { readonly parentItemId: string | null }) {
  const open = (kind: "Todo" | "Ticket") =>
    useAddItemStore.getState().open({ kind, parentItemId, detailed: null });
  return (
    <>
      <Button onClick={() => open("Todo")} data-testid="workspace-add-todo">
        <ListPlus size={14} aria-hidden="true" />
        New ToDo
      </Button>
      <Button onClick={() => open("Ticket")} data-testid="workspace-add-ticket">
        <TicketPlus size={14} aria-hidden="true" />
        New Ticket
      </Button>
    </>
  );
}

/**
 * The open area's header and items. A folder that is no longer in the
 * snapshot, such as one deleted elsewhere, falls back to the project root as
 * the legacy workspace did. Opening the project focuses quick-add, but moving
 * between its folders leaves focus where the user put it.
 */
function WorkspaceArea({ workspace, folderId, itemId, timeZone }: WorkspaceAreaProps) {
  const openedProjectRef = useRef<string | null>(null);
  const opening = openedProjectRef.current !== workspace.projectId;
  useEffect(() => {
    openedProjectRef.current = workspace.projectId;
  }, [workspace.projectId]);
  const itemPath = useItemPath(workspace.projectId, folderId, itemId);
  const folder = workspace.folders.find((candidate) => candidate.id === folderId);
  if (folderId !== null && folder === undefined) {
    return <Navigate {...areaTarget(workspace.projectId, null)} replace />;
  }
  const areaName = folder?.name ?? workspace.name;
  return (
    <PageContainer wide>
      <PageHeader
        title={itemPath.at(-1)?.title ?? areaName}
        eyebrow={
          <WorkspaceBreadcrumbs
            projectId={workspace.projectId}
            projectName={workspace.name}
            folders={workspace.folders}
            folderId={folderId}
            itemPath={itemPath}
          />
        }
        actions={<AddButtons parentItemId={itemId} />}
      />
      <AreaItems
        key={folderId ?? "root"}
        projectId={workspace.projectId}
        projectName={workspace.name}
        folderId={folderId}
        areaName={areaName}
        folders={workspace.folders}
        timeZone={timeZone}
        focusQuickAddOnLoad={opening}
        itemId={itemId}
      />
    </PageContainer>
  );
}

function ProjectLoadFailure(props: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <PageContainer>
      <LoadFailure {...props} testId="project-load-failure" />
    </PageContainer>
  );
}

/**
 * The project workspace route for the root and folder areas. It loads the
 * navigation snapshot and the server's time zone, and returns home when the
 * project is gone.
 */
export function ProjectPage() {
  const { projectId = "", folderId, itemId } = useCurrentArea();
  const atom = projectWorkspaceAtom(projectId);
  const workspace = useAtomValue(atom);
  const serverInfo = useAtomValue(serverInfoAtom);
  const refresh = useAtomRefresh(atom);
  const refreshServerInfo = useAtomRefresh(serverInfoAtom);
  const redirecting = useUnavailableProjectRedirect(workspace);

  if (redirecting || AsyncResult.isInitial(workspace) || AsyncResult.isInitial(serverInfo)) {
    return <PageContainer>{null}</PageContainer>;
  }
  if (AsyncResult.isFailure(workspace)) {
    return <ProjectLoadFailure message={describeRpcFailure(workspace.cause)} onRetry={refresh} />;
  }
  if (AsyncResult.isFailure(serverInfo)) {
    return (
      <ProjectLoadFailure
        message={describeRpcFailure(serverInfo.cause)}
        onRetry={refreshServerInfo}
      />
    );
  }
  return (
    <WorkspaceArea
      workspace={workspace.value}
      folderId={folderId}
      itemId={itemId}
      timeZone={serverInfo.value.timeZone}
    />
  );
}
