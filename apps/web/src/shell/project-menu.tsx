import { FileSpreadsheet, FolderDown, Plus, Settings, TableProperties } from "lucide-react";
import { useProjectActions } from "../home/use-project-actions.js";
import { useDataTransfer } from "../transfer/use-data-transfer.js";
import { MenuItem, MenuSeparator } from "../ui/menu.js";
import { MenuBarMenu } from "./menu-bar-menu.js";
import type { MenuPage } from "./use-menu-page.js";

/** Props for {@link ProjectMenu}. */
export interface ProjectMenuProps {
  readonly page: MenuPage;
  readonly onOpenProjectSettings: () => void;
}

/** New project and project import and export, offered on Home (§7.9). */
function HomeProjectItems() {
  const { createProject } = useProjectActions();
  const transfer = useDataTransfer();
  return (
    <>
      <MenuItem
        icon={<Plus size={14} aria-hidden="true" />}
        onClick={() => void createProject()}
        testId="menu-new-project"
      >
        New project…
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<TableProperties size={14} aria-hidden="true" />}
        disabled={transfer.running}
        onClick={() => void transfer.importCsv()}
        testId="transfer-import-csv"
      >
        Import CSV into project…
      </MenuItem>
      <MenuItem
        icon={<FolderDown size={14} aria-hidden="true" />}
        disabled={transfer.running}
        onClick={() => void transfer.exportProject()}
        testId="transfer-export-project"
      >
        Export project (JSON)…
      </MenuItem>
      <MenuItem
        icon={<FileSpreadsheet size={14} aria-hidden="true" />}
        disabled={transfer.running}
        onClick={() => void transfer.exportProjectCsv()}
        testId="transfer-export-project-csv"
      >
        Export project (CSV)…
      </MenuItem>
    </>
  );
}

/**
 * The Project menu: New project and project import and export on Home, and
 * Project Settings in a workspace. It is disabled on every other page, as
 * nothing there acts on a project (§8).
 */
export function ProjectMenu({ page, onOpenProjectSettings }: ProjectMenuProps) {
  return (
    <MenuBarMenu
      label="Project"
      accessKey="p"
      disabled={page !== "home" && page !== "workspace"}
      testId="menu-project"
      popupTestId="project-menu"
    >
      {page === "home" ? <HomeProjectItems /> : null}
      {page === "workspace" ? (
        <MenuItem
          icon={<Settings size={14} aria-hidden="true" />}
          onClick={onOpenProjectSettings}
          testId="menu-project-settings"
        >
          Project settings…
        </MenuItem>
      ) : null}
    </MenuBarMenu>
  );
}
