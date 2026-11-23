import { House, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useProjectActions } from "../home/use-project-actions.js";
import { useSidebarStore } from "../state/sidebar-store.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { SidebarLink } from "./sidebar-link.js";
import { SidebarProjectList } from "./sidebar-project-list.js";

/** The + below the project list: an icon on the rail, an icon and label when expanded. */
function NewProjectButton({ collapsed }: { readonly collapsed: boolean }) {
  const { createProject } = useProjectActions();
  return (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "sm"}
      className={collapsed ? "mx-auto" : "justify-start gap-2 px-2 text-fg-muted"}
      aria-label="New project"
      title="New project"
      onClick={() => void createProject()}
      data-testid="sidebar-new-project"
    >
      <Plus size={14} aria-hidden="true" />
      {collapsed ? null : <span>New project</span>}
    </Button>
  );
}

function ProjectsSection({ collapsed }: { readonly collapsed: boolean }) {
  return (
    <section aria-label="Projects" className="flex flex-col gap-1">
      {collapsed ? null : (
        <div className="flex h-7 items-center pr-1 pl-2">
          <h2 className="text-xs font-medium text-fg-subtle">Projects</h2>
        </div>
      )}
      <SidebarProjectList collapsed={collapsed} />
      <NewProjectButton collapsed={collapsed} />
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
 * The app's navigation sidebar: the projects, with the open project's folder tree nested
 * under its link and the New project button below them, then the collapse toggle and Home
 * at the bottom. It starts collapsed to an icon rail (§7.19, §8). App-wide pages, settings and the theme live
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
        "flex shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-150 motion-reduce:transition-none",
        collapsed ? "w-12" : "w-60",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        <ProjectsSection collapsed={collapsed} />
      </div>
      <div className="flex shrink-0 flex-col gap-1 border-t border-line px-2 py-2">
        <div className="flex h-8 items-center">
          <CollapseToggle collapsed={collapsed} />
        </div>
        <SidebarLink
          target={{ to: "/" }}
          icon={<House size={15} aria-hidden="true" />}
          exact
          testId="sidebar-home"
          iconOnly={collapsed}
        >
          Home
        </SidebarLink>
      </div>
    </nav>
  );
}
