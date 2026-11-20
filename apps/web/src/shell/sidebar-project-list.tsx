import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { projectSummariesAtom } from "../rpc/project-queries.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { useCurrentArea } from "../workspace/area-route.js";
import { ProjectIcon } from "./project-icon.js";
import { SidebarLink } from "./sidebar-link.js";
import { SidebarProjectFolders } from "./sidebar-project-folders.js";

/**
 * Projects in server order as sidebar links. It shares the home query and its
 * refreshes. The open project also shows its folder tree, unless the sidebar is
 * collapsed to its icon rail (§7.19).
 */
export function SidebarProjectList({ collapsed = false }: { readonly collapsed?: boolean }) {
  const summaries = useAtomValue(projectSummariesAtom);
  const projects = AsyncResult.isSuccess(summaries) ? summaries.value : [];
  const { projectId: openProjectId, folderId } = useCurrentArea();
  const rootDropActive = useWorkspaceStore((state) => state.itemDropArea?.folderId === null);

  return (
    <ul aria-label="Projects" data-testid="sidebar-projects" className="flex flex-col gap-px">
      {projects.map(({ project }) => (
        <li key={project.id} className="relative flex flex-col gap-px">
          <SidebarLink
            target={{ to: "/projects/$projectId", params: { projectId: project.id } }}
            icon={<ProjectIcon name={project.name} iconKey={project.iconKey ?? null} />}
            testId="sidebar-project-link"
            iconOnly={collapsed}
            exact={project.id === openProjectId}
            dropArea={project.id === openProjectId ? "" : undefined}
            dropActive={project.id === openProjectId && rootDropActive}
          >
            {project.name}
          </SidebarLink>
          {project.id === openProjectId && !collapsed ? (
            <SidebarProjectFolders projectId={project.id} currentFolderId={folderId} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
