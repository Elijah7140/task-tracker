import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { TodayProject, TodaySnapshot } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ArrowLeft, CalendarCheck, CircleAlert } from "lucide-react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { serverInfoAtom } from "../rpc/server-info-query.js";
import { todaySnapshotAtom } from "../rpc/today-queries.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { Button } from "../ui/button.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { type TodayExpansion, TodayRow } from "./today-row.js";
import { useLocalDayChange } from "./use-local-day-change.js";
import { type TodayActions, useTodayActions } from "./use-today-actions.js";
import { useTodayExpansion } from "./use-today-expansion.js";

/** Props for {@link TodayPage}. */
export interface TodayPageProps {
  readonly onBack: () => void;
  readonly runGuards: ReturnGuard;
}

function NothingCompleted() {
  return (
    <div
      data-testid="today-empty"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-16 text-center"
    >
      <span className="grid size-10 place-items-center rounded-card bg-hover text-fg-muted">
        <CalendarCheck size={20} aria-hidden="true" />
      </span>
      <p className="text-[15px] font-medium">Nothing completed today yet.</p>
    </div>
  );
}

function TodayError({ message }: { readonly message: string }) {
  return (
    <p
      role="alert"
      data-testid="today-error"
      className="flex items-start gap-2 rounded-card border border-line bg-danger-soft px-4 py-3 text-[13px] text-danger"
    >
      <CircleAlert size={15} aria-hidden="true" className="mt-px shrink-0" />
      {message}
    </p>
  );
}

interface ProjectCardProps {
  readonly project: typeof TodayProject.Type;
  readonly actions: TodayActions;
  readonly expansion: TodayExpansion;
}

/** One project with each area's breadcrumb and tree. */
function ProjectCard({ project, actions, expansion }: ProjectCardProps) {
  const headingId = `today-project-${project.projectId}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="today-project"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface px-5 py-4"
    >
      <h2 id={headingId} className="text-base font-semibold">
        {project.name}
      </h2>
      {project.areas.map((area) => (
        <div key={area.folderId ?? "root"} className="flex flex-col gap-1">
          <p data-testid="today-area-path" className="text-xs text-fg-muted">
            {area.path}
          </p>
          <ul aria-label={area.path} className="flex flex-col gap-px">
            {area.rows.map((row) => (
              <TodayRow key={row.itemId} row={row} actions={actions} expansion={expansion} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

interface TodayContentProps {
  readonly snapshot: typeof TodaySnapshot.Type;
  readonly actions: TodayActions;
  readonly expansion: TodayExpansion;
}

function TodayContent({ snapshot, actions, expansion }: TodayContentProps) {
  if (snapshot.projects.length === 0) {
    return <NothingCompleted />;
  }
  return snapshot.projects.map((project) => (
    <ProjectCard
      key={project.projectId}
      project={project}
      actions={actions}
      expansion={expansion}
    />
  ));
}

function BackButton({ onBack }: { readonly onBack: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="-ml-2 self-start"
      onClick={onBack}
      data-testid="today-back"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Back
    </Button>
  );
}

/**
 * The Today view (§7.14): items completed during the server's local day that
 * are still complete, grouped by project and area with open or earlier
 * ancestors as context. It refreshes after every save and when the local date
 * changes, checked each minute and on window activation.
 */
export function TodayPage({ onBack, runGuards }: TodayPageProps) {
  const serverInfo = useAtomValue(serverInfoAtom);
  const timeZone = AsyncResult.isSuccess(serverInfo) ? serverInfo.value.timeZone : "UTC";
  const result = useAtomValue(todaySnapshotAtom);
  const reload = useAtomRefresh(todaySnapshotAtom);
  useLocalDayChange(timeZone, reload);
  const snapshot = AsyncResult.isSuccess(result) ? result.value : null;
  const expansion = useTodayExpansion(snapshot);
  const actions = useTodayActions(runGuards);

  return (
    <PageContainer>
      <div data-testid="today-page" className="contents">
        <PageHeader
          title="Today"
          focusTitle
          eyebrow={<BackButton onBack={onBack} />}
          description={
            snapshot === null ? undefined : (
              <span data-testid="today-completed-count">
                {snapshot.completedCount} completed today
              </span>
            )
          }
        />
        <div className="flex flex-col gap-4">
          {actions.openError === null ? null : <TodayError message={actions.openError} />}
          {AsyncResult.isFailure(result) ? (
            <LoadFailure
              message={describeRpcFailure(result.cause)}
              onRetry={reload}
              testId="today-load-failure"
            />
          ) : snapshot === null ? (
            <p className="text-fg-muted" data-testid="today-loading">
              Loading today…
            </p>
          ) : (
            <TodayContent snapshot={snapshot} actions={actions} expansion={expansion} />
          )}
        </div>
      </div>
    </PageContainer>
  );
}
