import type { ProjectSummary } from "@task-tracker/contracts";
import { ProjectCard } from "./project-card.js";
import type { ProjectRef } from "./use-project-actions.js";

/** Props for {@link ProjectGrid}. */
export interface ProjectGridProps {
  readonly summaries: ReadonlyArray<typeof ProjectSummary.Type>;
  readonly onRename: (project: ProjectRef) => void;
  readonly onDelete: (project: ProjectRef) => void;
}

/** Project cards in a responsive grid, in the server's project order. */
export function ProjectGrid({ summaries, onRename, onDelete }: ProjectGridProps) {
  return (
    <ul
      aria-label="Projects"
      data-testid="project-grid"
      className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3"
    >
      {summaries.map((summary) => (
        <li key={summary.project.id} className="contents">
          <ProjectCard summary={summary} onRename={onRename} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
