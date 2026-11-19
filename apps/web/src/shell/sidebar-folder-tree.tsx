import { useNavigate } from "@tanstack/react-router";
import { type FocusEvent, type KeyboardEvent, useState } from "react";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { handleTreeKeyDown, TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";
import { treeStyles } from "../ui/tree-styles.js";
import { useRovingFocus } from "../ui/use-roving-focus.js";
import { areaTarget } from "../workspace/area-route.js";
import { buildFolderForest, type Folder, type FolderNode } from "../workspace/folder-outline.js";
import type { FolderActions } from "../workspace/use-folder-actions.js";
import { SidebarFolderRow } from "./sidebar-folder-row.js";

/** Props for {@link SidebarFolderTree}. */
export interface SidebarFolderTreeProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly folders: ReadonlyArray<Folder>;
  readonly currentFolderId: string | null;
  readonly actions: FolderActions;
}

interface BranchContext {
  readonly currentFolderId: string | null;
  readonly collapsed: ReadonlySet<string>;
  readonly menuFor: string | null;
  readonly actions: FolderActions;
  readonly tabIndexFor: (id: string) => number;
  readonly onItemFocus: (id: string) => void;
  readonly onOpen: (folder: Folder) => void;
  readonly onExpandedChange: (id: string, expanded: boolean) => void;
  readonly onMenuFor: (id: string | null) => void;
}

function FolderBranch({
  node,
  context,
}: {
  readonly node: FolderNode;
  readonly context: BranchContext;
}) {
  const { folder, children } = node;
  const current = folder.id === context.currentFolderId;
  const expanded = !context.collapsed.has(folder.id);
  const onFocus = (event: FocusEvent<HTMLLIElement>) => {
    if (event.target === event.currentTarget) {
      context.onItemFocus(folder.id);
    }
  };
  return (
    <li
      role="treeitem"
      aria-labelledby={`folder-name-${folder.id}`}
      aria-level={node.depth + 1}
      aria-expanded={children.length > 0 ? expanded : undefined}
      aria-selected={current}
      aria-current={current ? "page" : undefined}
      tabIndex={context.tabIndexFor(folder.id)}
      onFocus={onFocus}
      data-testid="folder-tree-item"
      {...{ [TREE_NODE_ATTRIBUTE]: folder.id }}
      className={treeStyles.item}
    >
      <SidebarFolderRow
        node={node}
        current={current}
        expanded={expanded}
        menuOpen={context.menuFor === folder.id}
        actions={context.actions}
        onOpen={() => context.onOpen(folder)}
        onExpandedChange={(next) => context.onExpandedChange(folder.id, next)}
        onMenuOpenChange={(open) => context.onMenuFor(open ? folder.id : null)}
      />
      {expanded && children.length > 0 ? (
        <ul role="group" className={treeStyles.group}>
          {children.map((child) => (
            <FolderBranch key={child.folder.id} node={child} context={context} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function visibleFolderIds(forest: ReadonlyArray<FolderNode>, collapsed: ReadonlySet<string>) {
  const ids = new Set<string>();
  const visit = (nodes: ReadonlyArray<FolderNode>) => {
    for (const node of nodes) {
      ids.add(node.folder.id);
      if (!collapsed.has(node.folder.id)) {
        visit(node.children);
      }
    }
  };
  visit(forest);
  return ids;
}

function folderKeyHandler(folders: ReadonlyArray<Folder>, context: BranchContext) {
  return (id: string, event: KeyboardEvent<HTMLElement>) => {
    const folder = folders.find((candidate) => candidate.id === id);
    if (folder === undefined) {
      return false;
    }
    if (event.key === "Enter") {
      context.onOpen(folder);
    } else if (event.key === "F2") {
      void context.actions.renameFolder(folder);
    } else if (event.key === "Delete") {
      void context.actions.deleteFolder(folder);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      context.onMenuFor(id);
    } else {
      return false;
    }
    return true;
  };
}

/**
 * The open project's folders as an ARIA tree under its sidebar link. Click or
 * Enter opens a folder's area. Arrows move and expand, F2 renames, Delete
 * deletes and the context-menu key or Shift+F10 opens the folder's actions.
 * Expansion lasts for the session.
 */
export function SidebarFolderTree(props: SidebarFolderTreeProps) {
  const { projectId, projectName, folders, currentFolderId, actions } = props;
  const navigate = useNavigate();
  const collapsed = useWorkspaceStore((state) => state.collapsedFolders);
  const setFolderExpanded = useWorkspaceStore((state) => state.setFolderExpanded);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const forest = buildFolderForest(folders);
  const visible = visibleFolderIds(forest, collapsed);
  const fallback =
    currentFolderId !== null && visible.has(currentFolderId)
      ? currentFolderId
      : (forest[0]?.folder.id ?? null);
  const roving = useRovingFocus(fallback, visible);

  if (forest.length === 0) {
    return null;
  }
  const context: BranchContext = {
    currentFolderId,
    collapsed,
    menuFor,
    actions,
    ...roving,
    onOpen: (folder) => void navigate(areaTarget(projectId, folder.id)),
    onExpandedChange: setFolderExpanded,
    onMenuFor: setMenuFor,
  };
  const onItemKey = folderKeyHandler(folders, context);
  return (
    <ul
      role="tree"
      aria-label={`Folders in ${projectName}`}
      data-testid="folder-tree"
      onKeyDown={(event) =>
        handleTreeKeyDown(event, { onExpandedChange: setFolderExpanded, onItemKey })
      }
      className={treeStyles.group}
    >
      {forest.map((node) => (
        <FolderBranch key={node.folder.id} node={node} context={context} />
      ))}
    </ul>
  );
}
