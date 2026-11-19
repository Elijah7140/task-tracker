import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { ProjectWorkspace } from "@task-tracker/contracts";
import { Link, Navigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { Settings } from "lucide-react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { projectWorkspaceAtom } from "../rpc/project-queries.js";
import { serverInfoAtom } from "../rpc/server-info-query.js";
import { buttonClassName } from "../ui/button.js";
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
  readonly timeZone: string;
}

/**
 * The open area's header and items. A folder that is no longer in the
 * snapshot, such as one deleted elsewhere, falls back to the project root as
 * the legacy workspace did.
 */
function WorkspaceArea({ workspace, folderId, timeZone }: WorkspaceAreaProps) {
  const folder = workspace.folders.find((candidate) => candidate.id === folderId);
  if (folderId !== null && folder === undefined) {
    return <Navigate {...areaTarget(workspace.projectId, null)} replace />;
  }
  const areaName = folder?.name ?? workspace.name;
  return (
    <PageContainer>
      <PageHeader
        title={areaName}
        eyebrow={
          <WorkspaceBreadcrumbs
            projectId={workspace.projectId}
            projectName={workspace.name}
            folders={workspace.folders}
            folderId={folderId}
          />
        }
        actions={
          <Link
            to="/projects/$projectId/settings"
            params={{ projectId: workspace.projectId }}
            data-testid="workspace-project-settings"
            className={buttonClassName("ghost", "sm")}
          >
            <Settings size={14} aria-hidden="true" />
            Project settings
          </Link>
        }
      />
      <AreaItems
        key={folderId ?? "root"}
        projectId={workspace.projectId}
        folderId={folderId}
        areaName={areaName}
        timeZone={timeZone}
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
  const { projectId = "", folderId } = useCurrentArea();
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
      timeZone={serverInfo.value.timeZone}
    />
  );
}
