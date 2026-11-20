import { Menu } from "@base-ui/react/menu";
import { useNavigate } from "@tanstack/react-router";
import { Ellipsis, Pencil, Settings, Shapes, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button.js";
import { MenuContent, MenuItem } from "../ui/menu.js";
import { type IconTarget, ProjectIconDialog } from "./project-icon-dialog.js";
import type { ProjectRef } from "./use-project-actions.js";

/** Props for {@link ProjectCardMenu}. */
export interface ProjectCardMenuProps {
  readonly project: ProjectRef;
  /** The project's icon, which Change icon… starts from (§7.19). */
  readonly iconKey: string | null;
  readonly onRename: (project: ProjectRef) => void;
  readonly onDelete: (project: ProjectRef) => void;
}

/** The card's overflow menu. It appears on hover or focus to keep cards quiet. */
export function ProjectCardMenu({ project, iconKey, onRename, onDelete }: ProjectCardMenuProps) {
  const navigate = useNavigate();
  const [iconTarget, setIconTarget] = useState<IconTarget | null>(null);
  return (
    <>
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
            icon={<Shapes size={14} />}
            onClick={() => setIconTarget({ ...project, iconKey })}
            testId="project-change-icon"
          >
            Change icon…
          </MenuItem>
          <MenuItem
            icon={<Settings size={14} />}
            onClick={() =>
              void navigate({
                to: "/projects/$projectId/settings",
                params: { projectId: project.id },
              })
            }
            testId="project-settings"
          >
            Settings
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
      <ProjectIconDialog target={iconTarget} onClose={() => setIconTarget(null)} />
    </>
  );
}
