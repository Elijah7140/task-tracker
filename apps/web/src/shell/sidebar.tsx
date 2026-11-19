import { CircleCheck, House, Plus } from "lucide-react";
import { useProjectActions } from "../home/use-project-actions.js";
import { Button } from "../ui/button.js";
import { SidebarLink } from "./sidebar-link.js";
import { SidebarProjectList } from "./sidebar-project-list.js";
import { ThemeSwitcher } from "./theme-switcher.js";

function SidebarBrand() {
  return (
    <div data-testid="sidebar-brand" className="flex h-12 items-center gap-2 px-4">
      <span className="grid size-6 place-items-center rounded-control bg-accent text-on-accent">
        <CircleCheck size={15} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="font-semibold tracking-tight">Task Tracker</span>
    </div>
  );
}

function ProjectsSection() {
  const { createProject } = useProjectActions();
  return (
    <section className="flex flex-col gap-1">
      <div className="flex h-7 items-center justify-between pr-1 pl-2">
        <h2 className="text-xs font-medium text-fg-subtle">Projects</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="New project"
          onClick={() => void createProject()}
          data-testid="sidebar-new-project"
        >
          <Plus size={14} aria-hidden="true" />
        </Button>
      </div>
      <SidebarProjectList />
    </section>
  );
}

/**
 * The app's navigation sidebar. Later screens add sections (the folder tree,
 * settings) between the project list and the footer.
 */
export function Sidebar() {
  return (
    <nav
      aria-label="Main"
      data-testid="sidebar"
      className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar"
    >
      <SidebarBrand />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
        <SidebarLink
          target={{ to: "/" }}
          icon={<House size={15} aria-hidden="true" />}
          exact
          testId="sidebar-home"
        >
          Home
        </SidebarLink>
        <ProjectsSection />
      </div>
      <div className="border-t border-line p-3">
        <ThemeSwitcher />
      </div>
    </nav>
  );
}
