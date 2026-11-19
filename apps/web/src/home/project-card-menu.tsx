import { Menu } from "@base-ui/react/menu";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button.js";
import { MenuContent, MenuItem } from "../ui/menu.js";
import type { ProjectRef } from "./use-project-actions.js";

/** Props for {@link ProjectCardMenu}. */
export interface ProjectCardMenuProps {
  readonly project: ProjectRef;
  readonly onRename: (project: ProjectRef) => void;
  readonly onDelete: (project: ProjectRef) => void;
}

/** The card's overflow menu. It appears on hover or focus to keep cards quiet. */
export function ProjectCardMenu({ project, onRename, onDelete }: ProjectCardMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${project.name}`}
            data-testid="project-card-menu"
            className="relative z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <Ellipsis size={16} aria-hidden="true" />
      </Menu.Trigger>
      <MenuContent testId="project-card-menu-popup">
        <MenuItem
          icon={<Pencil size={14} />}
          onClick={() => onRename(project)}
          testId="project-rename"
        >
          Rename
        </MenuItem>
        <MenuItem
          icon={<Trash2 size={14} />}
          tone="danger"
          onClick={() => onDelete(project)}
          testId="project-delete"
        >
          Delete
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  );
}
