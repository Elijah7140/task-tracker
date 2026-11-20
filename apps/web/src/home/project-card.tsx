import type { ProjectSummary } from "@task-tracker/contracts";
import { Link } from "@tanstack/react-router";
import { Circle } from "lucide-react";
import { ProjectIcon } from "../shell/project-icon.js";
import { OverdueBadge } from "./overdue-badge.js";
import { ProjectCardMenu } from "./project-card-menu.js";
import type { ProjectRef } from "./use-project-actions.js";

/** Props for {@link ProjectCard}. */
export interface ProjectCardProps {
  readonly summary: typeof ProjectSummary.Type;
  readonly onRename: (project: ProjectRef) => void;
  readonly onDelete: (project: ProjectRef) => void;
}

/**
 * A home card with the project's name, open count and overdue count. The name
 * link covers the card, so a click or Enter opens the project.
 */
export function ProjectCard({ summary, onRename, onDelete }: ProjectCardProps) {
  const { project, openCount, overdueCount } = summary;
  return (
    <article
      data-testid="project-card"
      aria-label={project.name}
      className="group relative flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow] duration-150 has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-focus hover:border-line-strong hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectIcon name={project.name} size="lg" />
          <h2 className="truncate text-[15px] font-semibold tracking-tight">
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              data-card-link=""
              data-testid="project-card-link"
              className="outline-none after:absolute after:inset-0 after:rounded-card"
            >
              {project.name}
            </Link>
          </h2>
        </div>
        <ProjectCardMenu project={project} onRename={onRename} onDelete={onDelete} />
      </div>
      <div className="flex items-center gap-3 text-[13px] text-fg-muted">
        <span data-testid="project-open-count" className="inline-flex items-center gap-1.5">
          <Circle size={12} strokeWidth={2.25} aria-hidden="true" />
          {openCount} open
        </span>
        <OverdueBadge count={overdueCount} />
      </div>
    </article>
  );
}
