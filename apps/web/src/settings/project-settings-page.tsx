import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { projectSummariesAtom, projectWorkspaceAtom } from "../rpc/project-queries.js";
import { globalSettingsAtom, projectSettingsAtom } from "../rpc/settings-queries.js";
import { notify } from "../state/dialog-store.js";
import { buttonClassName } from "../ui/button.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { areaTarget, useCurrentArea } from "../workspace/area-route.js";
import { useUnavailableProjectRedirect } from "../workspace/use-unavailable-project-redirect.js";
import { FieldManagerCard } from "./field-manager-card.js";
import { ProjectOverridesCard } from "./project-overrides-card.js";
import { useUnsavedSettingsGuard } from "./use-unsaved-settings-guard.js";

function SettingsBreadcrumbs({
  projectId,
  projectName,
}: {
  readonly projectId: string;
  readonly projectName: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-[13px] text-fg-subtle">
      <ol className="flex min-w-0 items-center gap-1">
        <li className="flex items-center gap-1">
          <Link to="/" className="rounded-[0.25rem] px-1 hover:bg-hover hover:text-fg">
            Projects
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-1">
          <ChevronRight size={13} aria-hidden="true" className="shrink-0" />
          <Link
            {...areaTarget(projectId, null)}
            className="truncate rounded-[0.25rem] px-1 hover:bg-hover hover:text-fg"
          >
            {projectName}
          </Link>
        </li>
        <li className="flex items-center gap-1">
          <ChevronRight size={13} aria-hidden="true" className="shrink-0" />
          <span aria-current="page" className="px-1 text-fg-muted">
            Settings
          </span>
        </li>
      </ol>
    </nav>
  );
}

/**
 * The Project Settings route (`/projects/$projectId/settings`): edits optional
 * per-project overrides while showing inherited global values, and manages the
 * project's own custom fields beside the inherited global fields.
 */
export function ProjectSettingsPage() {
  const { projectId = "" } = useCurrentArea();
  const [dirty, setDirty] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const { bypass } = useUnsavedSettingsGuard(
    dirty,
    "Your changes to this project's settings haven't been saved.",
    () => {
      setDirty(false);
      setDraftVersion((version) => version + 1);
    },
  );
  const navigate = useNavigate();
  const refreshProjects = useAtomRefresh(projectSummariesAtom);

  const workspaceAtom = projectWorkspaceAtom(projectId);
  const settingsAtom = projectSettingsAtom(projectId);
  const workspace = useAtomValue(workspaceAtom);
  const projectSettings = useAtomValue(settingsAtom);
  const globalSettings = useAtomValue(globalSettingsAtom);
  const refreshWorkspace = useAtomRefresh(workspaceAtom);
  const refreshSettings = useAtomRefresh(settingsAtom);
  const refreshGlobal = useAtomRefresh(globalSettingsAtom);

  const redirecting = useUnavailableProjectRedirect(
    AsyncResult.isFailure(projectSettings) ? projectSettings : workspace,
    bypass,
  );

  const handleMissingOnSave = useCallback(
    (message: string) => {
      bypass();
      refreshProjects();
      void navigate({ to: "/" });
      void notify({ title: "Project unavailable", message });
    },
    [bypass, navigate, refreshProjects],
  );

  if (
    redirecting ||
    AsyncResult.isInitial(workspace) ||
    AsyncResult.isInitial(projectSettings) ||
    AsyncResult.isInitial(globalSettings)
  ) {
    return (
      <PageContainer>
        <div className="h-64 animate-pulse rounded-card bg-hover" />
      </PageContainer>
    );
  }

  const failure = AsyncResult.isFailure(workspace)
    ? workspace
    : AsyncResult.isFailure(projectSettings)
      ? projectSettings
      : AsyncResult.isFailure(globalSettings)
        ? globalSettings
        : undefined;
  if (failure !== undefined) {
    return (
      <PageContainer>
        <LoadFailure
          message={describeRpcFailure(failure.cause)}
          onRetry={() => {
            refreshWorkspace();
            refreshSettings();
            refreshGlobal();
          }}
          testId="project-settings-load-failure"
        />
      </PageContainer>
    );
  }
  if (
    !AsyncResult.isSuccess(workspace) ||
    !AsyncResult.isSuccess(projectSettings) ||
    !AsyncResult.isSuccess(globalSettings)
  ) {
    return (
      <PageContainer>
        <div className="h-64 animate-pulse rounded-card bg-hover" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Project Settings"
        description={workspace.value.name}
        eyebrow={
          <SettingsBreadcrumbs
            projectId={workspace.value.projectId}
            projectName={workspace.value.name}
          />
        }
        actions={
          <Link
            {...areaTarget(workspace.value.projectId, null)}
            data-testid="project-settings-back"
            className={buttonClassName("ghost", "sm")}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to project
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <ProjectOverridesCard
          key={`${workspace.value.projectId}:${draftVersion}`}
          projectId={workspace.value.projectId}
          globalDefaults={globalSettings.value}
          initial={projectSettings.value}
          onDirtyChange={setDirty}
          onProjectMissing={handleMissingOnSave}
        />
        <FieldManagerCard
          key={`fields:${workspace.value.projectId}`}
          projectId={workspace.value.projectId}
        />
      </div>
    </PageContainer>
  );
}
