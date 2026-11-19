import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronRight, FolderTree } from "lucide-react";
import { AsyncResult } from "effect/reactivity";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { projectWorkspaceAtom } from "../rpc/project-queries.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { useUnavailableProjectRedirect } from "./use-unavailable-project-redirect.js";

function Breadcrumb({ name }: { readonly name: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-fg-subtle">
      <Link
        to="/"
        data-testid="breadcrumb-projects"
        className="rounded-[0.25rem] px-1 hover:bg-hover hover:text-fg"
      >
        Projects
      </Link>
      <ChevronRight size={13} aria-hidden="true" />
      <span className="px-1 text-fg-muted">{name}</span>
    </nav>
  );
}

function WorkspacePlaceholder() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-16 text-center text-fg-muted">
      <FolderTree size={20} aria-hidden="true" />
      <p>Folders and items for this project appear here.</p>
    </div>
  );
}

/**
 * The project route. It loads the workspace snapshot and returns home when the
 * project is gone. The workspace screen replaces the placeholder body.
 */
export function ProjectPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const atom = projectWorkspaceAtom(projectId);
  const workspace = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const redirecting = useUnavailableProjectRedirect(workspace);

  if (redirecting || AsyncResult.isInitial(workspace)) {
    return <PageContainer>{null}</PageContainer>;
  }
  if (AsyncResult.isFailure(workspace)) {
    const message = describeRpcFailure(workspace.cause);
    return (
      <PageContainer>
        <LoadFailure message={message} onRetry={refresh} testId="project-load-failure" />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader
        title={workspace.value.name}
        eyebrow={<Breadcrumb name={workspace.value.name} />}
      />
      <WorkspacePlaceholder />
    </PageContainer>
  );
}
