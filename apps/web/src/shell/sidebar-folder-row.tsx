import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { ChevronRight, Ellipsis, Folder as FolderIcon, FolderOpen } from "lucide-react";
import type { MouseEvent } from "react";
import { cx } from "../ui/class-names.js";
import { ContextMenuContent, MenuContent } from "../ui/menu.js";
import { treeStyles } from "../ui/tree-styles.js";
import type { FolderNode } from "../workspace/folder-outline.js";
import type { FolderActions } from "../workspace/use-folder-actions.js";
import { FolderMenuItems } from "./folder-menu-items.js";

/** Props for {@link SidebarFolderRow}. */
export interface SidebarFolderRowProps {
  readonly node: FolderNode;
  readonly current: boolean;
  readonly expanded: boolean;
  readonly menuOpen: boolean;
  readonly actions: FolderActions;
  readonly onOpen: () => void;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onMenuOpenChange: (open: boolean) => void;
}

function Chevron({
  node,
  expanded,
  onExpandedChange,
}: Pick<SidebarFolderRowProps, "node" | "expanded" | "onExpandedChange">) {
  if (node.children.length === 0) {
    return <span className="size-5 shrink-0" aria-hidden="true" />;
  }
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    onExpandedChange(!expanded);
  };
  return (
    <span
      aria-hidden="true"
      data-testid="folder-toggle"
      onClick={toggle}
      className={cx(treeStyles.chevron, expanded && "rotate-90")}
    >
      <ChevronRight size={13} />
    </span>
  );
}

function OverflowMenu({ node, actions, menuOpen, onMenuOpenChange }: SidebarFolderRowProps) {
  return (
    <Menu.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
      <Menu.Trigger
        tabIndex={-1}
        aria-label={`Actions for ${node.folder.name}`}
        data-testid="folder-menu"
        onClick={(event) => event.stopPropagation()}
        className="grid size-5 shrink-0 cursor-default place-items-center rounded-[0.3125rem] text-fg-subtle opacity-0 group-hover/row:opacity-100 hover:bg-pressed hover:text-fg data-popup-open:opacity-100"
      >
        <Ellipsis size={14} aria-hidden="true" />
      </Menu.Trigger>
      <MenuContent testId="folder-menu-popup">
        <FolderMenuItems folder={node.folder} actions={actions} />
      </MenuContent>
    </Menu.Root>
  );
}

/**
 * The visible row of a folder tree item: expand chevron, icon, name and an
 * overflow menu. Right-click opens the same actions as a context menu.
 */
export function SidebarFolderRow(props: SidebarFolderRowProps) {
  const { node, current, expanded, actions, onOpen } = props;
  const Icon = expanded && node.children.length > 0 ? FolderOpen : FolderIcon;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        data-tree-row=""
        data-testid="folder-row"
        onClick={onOpen}
        className={cx(
          "group/row flex h-7 min-w-0 cursor-default items-center gap-1 rounded-control pr-1 text-fg-muted transition-colors hover:bg-hover hover:text-fg",
          current && "bg-pressed font-medium text-fg",
        )}
        style={{ paddingLeft: `${1.375 + node.depth * 0.875}rem` }}
      >
        <Chevron {...props} />
        <Icon size={14} aria-hidden="true" className="shrink-0" />
        <span id={`folder-name-${node.folder.id}`} className="min-w-0 flex-1 truncate pl-1">
          {node.folder.name}
        </span>
        <OverflowMenu {...props} />
      </ContextMenu.Trigger>
      <ContextMenuContent testId="folder-context-menu">
        <FolderMenuItems folder={node.folder} actions={actions} />
      </ContextMenuContent>
    </ContextMenu.Root>
  );
}
