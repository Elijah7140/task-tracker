import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { projectSummariesAtom } from "../rpc/project-queries.js";
import { useCurrentArea } from "../workspace/area-route.js";
import { ProjectIcon } from "./project-icon.js";
import { SidebarLink } from "./sidebar-link.js";
import { SidebarProjectFolders } from "./sidebar-project-folders.js";

/**
 * Projects in server order as sidebar links. It shares the home query and its
 * refreshes. The open project also shows its folder tree.
 */
export function SidebarProjectList() {
  const summaries = useAtomValue(projectSummariesAtom);
  const projects = AsyncResult.isSuccess(summaries) ? summaries.value : [];
  const { projectId: openProjectId, folderId } = useCurrentArea();

  return (
    <ul aria-label="Projects" data-testid="sidebar-projects" className="flex flex-col gap-px">
      {projects.map(({ project }) => (
        <li key={project.id} className="relative flex flex-col gap-px">
          <SidebarLink
            target={{ to: "/projects/$projectId", params: { projectId: project.id } }}
            icon={<ProjectIcon name={project.name} />}
            testId="sidebar-project-link"
            exact={project.id === openProjectId}
          >
            {project.name}
          </SidebarLink>
          {project.id === openProjectId ? (
            <SidebarProjectFolders projectId={project.id} currentFolderId={folderId} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
