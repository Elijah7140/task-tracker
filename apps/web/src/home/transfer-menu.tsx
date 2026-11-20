import { Menu } from "@base-ui/react/menu";
import {
  ArrowDownUp,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FolderDown,
  TableProperties,
  Upload,
} from "lucide-react";
import { useDataTransfer } from "../transfer/use-data-transfer.js";
import { Button } from "../ui/button.js";
import { MenuContent, MenuItem, MenuSeparator } from "../ui/menu.js";

/**
 * Home's Import and export menu (§7.9): JSON and CSV import, and JSON and CSV
 * project export. Its commands are disabled while a
 * transfer runs, including while one of its dialogs is open.
 */
export function TransferMenu() {
  const transfer = useDataTransfer();
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="secondary" data-testid="transfer-menu-button" />}>
        <ArrowDownUp size={15} aria-hidden="true" />
        Import and export
        <ChevronDown size={14} aria-hidden="true" className="-mr-1 text-fg-subtle" />
      </Menu.Trigger>
      <MenuContent testId="transfer-menu-popup">
        <MenuItem
          icon={<Upload size={14} />}
          disabled={transfer.running}
          onClick={() => void transfer.importJson()}
          testId="transfer-import-json"
        >
          Import JSON…
        </MenuItem>
        <MenuItem
          icon={<TableProperties size={14} />}
          disabled={transfer.running}
          onClick={() => void transfer.importCsv()}
          testId="transfer-import-csv"
        >
          Import CSV into project…
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<Download size={14} />}
          disabled={transfer.running}
          onClick={() => void transfer.exportEverything()}
          testId="transfer-export-all"
        >
          Export everything (JSON)…
        </MenuItem>
        <MenuItem
          icon={<FolderDown size={14} />}
          disabled={transfer.running}
          onClick={() => void transfer.exportProject()}
          testId="transfer-export-project"
        >
          Export project (JSON)…
        </MenuItem>
        <MenuItem
          icon={<FileSpreadsheet size={14} />}
          disabled={transfer.running}
          onClick={() => void transfer.exportProjectCsv()}
          testId="transfer-export-project-csv"
        >
          Export project (CSV)…
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  );
}
