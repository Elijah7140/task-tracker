import { House, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useProjectActions } from "../home/use-project-actions.js";
import { useSidebarStore } from "../state/sidebar-store.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { SidebarLink } from "./sidebar-link.js";
import { SidebarProjectList } from "./sidebar-project-list.js";

function NewProjectButton() {
  const { createProject } = useProjectActions();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label="New project"
      title="New project"
      onClick={() => void createProject()}
      data-testid="sidebar-new-project"
    >
      <Plus size={14} aria-hidden="true" />
    </Button>
  );
}

function ProjectsSection({ collapsed }: { readonly collapsed: boolean }) {
  return (
    <section aria-label="Projects" className="flex flex-col gap-1">
      {collapsed ? (
        <div className="flex h-7 items-center justify-center">
          <NewProjectButton />
        </div>
      ) : (
        <div className="flex h-7 items-center justify-between pr-1 pl-2">
          <h2 className="text-xs font-medium text-fg-subtle">Projects</h2>
          <NewProjectButton />
        </div>
      )}
      <SidebarProjectList collapsed={collapsed} />
    </section>
  );
}

function CollapseToggle({ collapsed }: { readonly collapsed: boolean }) {
  const setExpanded = useSidebarStore((state) => state.setExpanded);
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      onClick={() => setExpanded(collapsed)}
      data-testid="sidebar-toggle"
      className={collapsed ? "mx-auto" : "ml-auto"}
    >
      {collapsed ? (
        <PanelLeftOpen size={15} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={15} aria-hidden="true" />
      )}
    </Button>
  );
}

/**
 * The app's navigation sidebar: Home and the projects, with the open project's folder tree
 * nested under its link. It starts collapsed to an icon rail of Home and the project icons,
 * and the toggle at its top expands it (§7.19). App-wide pages, settings and the theme live
 * in the menu bar and App Settings (§8).
 */
export function Sidebar() {
  const collapsed = !useSidebarStore((state) => state.expanded);
  return (
    <nav
      aria-label="Main"
      data-testid="sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={cx(
        "flex shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-150",
        collapsed ? "w-12" : "w-60",
      )}
    >
      <div className="flex h-10 shrink-0 items-center px-2">
        <CollapseToggle collapsed={collapsed} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
        <SidebarLink
          target={{ to: "/" }}
          icon={<House size={15} aria-hidden="true" />}
          exact
          testId="sidebar-home"
          iconOnly={collapsed}
        >
          Home
        </SidebarLink>
        <ProjectsSection collapsed={collapsed} />
      </div>
    </nav>
  );
}
