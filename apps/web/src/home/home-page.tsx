import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { Plus } from "lucide-react";
import { AsyncResult } from "effect/reactivity";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { projectSummariesAtom } from "../rpc/project-queries.js";
import { Button } from "../ui/button.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { EmptyHome } from "./empty-home.js";
import { ProjectGrid } from "./project-grid.js";
import { ProjectGridSkeleton } from "./project-grid-skeleton.js";
import { SavedSearchesSection } from "./saved-searches-section.js";
import { TransferActivity } from "./transfer-activity.js";
import { TransferMenu } from "./transfer-menu.js";
import { useProjectActions } from "./use-project-actions.js";

function HomeContent() {
  const summaries = useAtomValue(projectSummariesAtom);
  const refresh = useAtomRefresh(projectSummariesAtom);
  const actions = useProjectActions();

  return AsyncResult.match(summaries, {
    onInitial: () => <ProjectGridSkeleton />,
    onFailure: (failure) => (
      <LoadFailure
        message={describeRpcFailure(failure.cause)}
        onRetry={refresh}
        testId="home-load-failure"
      />
    ),
    onSuccess: ({ value }) =>
      value.length === 0 ? (
        <EmptyHome onCreate={() => void actions.createProject()} />
      ) : (
        <ProjectGrid
          summaries={value}
          onRename={(project) => void actions.renameProject(project)}
          onDelete={(project) => void actions.deleteProject(project)}
        />
      ),
  });
}

/**
 * The home screen: project cards with open and overdue counts, New project,
 * Import and export with its progress and status, and saved searches.
 */
export function HomePage() {
  const { createProject } = useProjectActions();
  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Choose a space to continue your work."
        actions={
          <>
            <TransferMenu />
            <Button
              variant="primary"
              onClick={() => void createProject()}
              data-testid="new-project-button"
            >
              <Plus size={15} aria-hidden="true" />
              New project
            </Button>
          </>
        }
      />
      <TransferActivity />
      <HomeContent />
      <SavedSearchesSection />
    </PageContainer>
  );
}
