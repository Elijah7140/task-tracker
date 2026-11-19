import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { projectSummariesAtom } from "../rpc/project-queries.js";
import { ProjectIcon } from "./project-icon.js";
import { SidebarLink } from "./sidebar-link.js";

/** Projects in server order as sidebar links. It shares the home query and its refreshes. */
export function SidebarProjectList() {
  const summaries = useAtomValue(projectSummariesAtom);
  const projects = AsyncResult.isSuccess(summaries) ? summaries.value : [];

  return (
    <ul aria-label="Projects" data-testid="sidebar-projects" className="flex flex-col gap-px">
      {projects.map(({ project }) => (
        <li key={project.id}>
          <SidebarLink
            target={{ to: "/projects/$projectId", params: { projectId: project.id } }}
            icon={<ProjectIcon name={project.name} />}
            testId="sidebar-project-link"
          >
            {project.name}
          </SidebarLink>
        </li>
      ))}
    </ul>
  );
}
