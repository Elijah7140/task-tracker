import { Download, Settings, Upload } from "lucide-react";
import { useDataTransfer } from "../transfer/use-data-transfer.js";
import { MenuItem, MenuSeparator } from "../ui/menu.js";
import { MenuBarMenu } from "./menu-bar-menu.js";

/** Props for {@link FileMenu}. */
export interface FileMenuProps {
  /** Whether Home is on show, which adds app-wide import and export (§7.9). */
  readonly onHome: boolean;
  readonly onOpenSettings: () => void;
}

/** App-wide import and export, offered from Home and disabled while a transfer runs. */
function AppTransferItems() {
  const transfer = useDataTransfer();
  return (
    <>
      <MenuSeparator />
      <MenuItem
        icon={<Upload size={14} aria-hidden="true" />}
        disabled={transfer.running}
        onClick={() => void transfer.importJson()}
        testId="transfer-import-json"
      >
        Import JSON…
      </MenuItem>
      <MenuItem
        icon={<Download size={14} aria-hidden="true" />}
        disabled={transfer.running}
        onClick={() => void transfer.exportEverything()}
        testId="transfer-export-all"
      >
        Export everything (JSON)…
      </MenuItem>
    </>
  );
}

/** The File menu: App Settings from any page, plus app-wide import and export on Home (§8). */
export function FileMenu({ onHome, onOpenSettings }: FileMenuProps) {
  return (
    <MenuBarMenu label="File" accessKey="f" testId="menu-file" popupTestId="file-menu">
      <MenuItem
        icon={<Settings size={14} aria-hidden="true" />}
        onClick={onOpenSettings}
        testId="menu-app-settings"
      >
        Settings…
      </MenuItem>
      {onHome ? <AppTransferItems /> : null}
    </MenuBarMenu>
  );
}
