import type { ReactNode } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CircleCheck,
  House,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { useProjectActions } from "../home/use-project-actions.js";
import { Button } from "../ui/button.js";
import { type CoveringPage, useReturnPageStore } from "../state/return-page-store.js";
import { useCurrentArea } from "../workspace/area-route.js";
import { SIDEBAR_ROW_CLASS, SidebarLink } from "./sidebar-link.js";
import { SidebarProjectList } from "./sidebar-project-list.js";
import { ThemeSwitcher } from "./theme-switcher.js";
import { useOpenCoveringPage } from "./use-open-covering-page.js";

function SidebarBrand({ editMenu }: { readonly editMenu?: ReactNode }) {
  return (
    <div data-testid="sidebar-brand" className="flex h-12 items-center gap-2 px-4">
      <span className="grid size-6 place-items-center rounded-control bg-accent text-on-accent">
        <CircleCheck size={15} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="font-semibold tracking-tight">Task Tracker</span>
      {editMenu}
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

/** The Settings link. From an open project, App Settings' Back returns to it. */
function SettingsLink() {
  const { projectId } = useCurrentArea();
  const search = projectId === undefined ? {} : { returnProjectId: projectId };
  return (
    <SidebarLink
      target={{ to: "/settings", search }}
      icon={<Settings size={15} aria-hidden="true" />}
      exact
      testId="sidebar-settings"
    >
      Settings
    </SidebarLink>
  );
}

/** Opens a covering page and shows which one is active. */
function CoveringPageEntry({
  page,
  label,
  icon,
}: {
  readonly page: CoveringPage;
  readonly label: string;
  readonly icon: ReactNode;
}) {
  const open = useOpenCoveringPage();
  const shown = useReturnPageStore((state) => state.covering === page);
  return (
    <button
      type="button"
      onClick={() => open(page)}
      aria-current={shown ? "page" : undefined}
      data-testid={`sidebar-${page}`}
      className={SIDEBAR_ROW_CLASS}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The app's navigation sidebar. The open project's folder tree nests under its
 * project link. Later screens add sections (settings) between the project list
 * and the footer.
 */
export function Sidebar({ editMenu }: { readonly editMenu?: ReactNode }) {
  return (
    <nav
      aria-label="Main"
      data-testid="sidebar"
      className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar"
    >
      <SidebarBrand editMenu={editMenu} />
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
      <div className="flex flex-col gap-0.5 border-t border-line px-2 py-2">
        <CoveringPageEntry
          page="search"
          label="Search"
          icon={<Search size={15} aria-hidden="true" />}
        />
        <CoveringPageEntry
          page="calendar"
          label="Calendar"
          icon={<CalendarDays size={15} aria-hidden="true" />}
        />
        <CoveringPageEntry
          page="today"
          label="Today"
          icon={<CalendarCheck size={15} aria-hidden="true" />}
        />
        <CoveringPageEntry
          page="trash"
          label="Trash"
          icon={<Trash2 size={15} aria-hidden="true" />}
        />
        <SettingsLink />
      </div>
      <div className="border-t border-line p-3">
        <ThemeSwitcher />
      </div>
    </nav>
  );
}
