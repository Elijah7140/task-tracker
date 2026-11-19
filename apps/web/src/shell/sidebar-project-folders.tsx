import { useAtomValue } from "@effect/atom-react";
import type { ProjectWorkspace } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { FolderPlus } from "lucide-react";
import { projectWorkspaceAtom } from "../rpc/project-queries.js";
import { Button } from "../ui/button.js";
import { useFolderActions } from "../workspace/use-folder-actions.js";
import { SidebarFolderTree } from "./sidebar-folder-tree.js";

/** Props for {@link SidebarProjectFolders}. */
export interface SidebarProjectFoldersProps {
  readonly projectId: string;
  readonly currentFolderId: string | null;
}

function LoadedFolders({
  workspace,
  currentFolderId,
}: {
  readonly workspace: typeof ProjectWorkspace.Type;
  readonly currentFolderId: string | null;
}) {
  const scope = {
    projectId: workspace.projectId,
    projectName: workspace.name,
    folders: workspace.folders,
  };
  const actions = useFolderActions(scope);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`New folder in ${workspace.name}`}
        data-testid="sidebar-new-folder"
        onClick={() => void actions.createFolder(null)}
        className="absolute top-0.5 right-1 size-6"
      >
        <FolderPlus size={14} aria-hidden="true" />
      </Button>
      <SidebarFolderTree
        projectId={workspace.projectId}
        projectName={workspace.name}
        folders={workspace.folders}
        currentFolderId={currentFolderId}
        actions={actions}
      />
    </>
  );
}

/**
 * The open project's folder tree and its New folder action, shown under the
 * project's sidebar link. The project link itself is the root area. It shares
 * the workspace query with the project page.
 */
export function SidebarProjectFolders({ projectId, currentFolderId }: SidebarProjectFoldersProps) {
  const workspace = useAtomValue(projectWorkspaceAtom(projectId));
  if (!AsyncResult.isSuccess(workspace)) {
    return null;
  }
  return <LoadedFolders workspace={workspace.value} currentFolderId={currentFolderId} />;
}
