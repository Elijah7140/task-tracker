import { Menu } from "@base-ui/react/menu";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "../ui/button.js";
import { MenuContent, MenuItem } from "../ui/menu.js";
import type { useHistoryActions } from "./use-history-actions.js";

/** The Edit menu exposes the two named history actions from any page. */
export function EditMenu({ undo, redo, busy, apply }: ReturnType<typeof useHistoryActions>) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button size="sm" variant="ghost" className="ml-auto" />}
        data-testid="edit-menu-trigger"
      >
        Edit
      </Menu.Trigger>
      <MenuContent testId="edit-menu">
        <MenuItem
          icon={<Undo2 size={14} aria-hidden="true" />}
          disabled={busy || undo === null}
          onClick={() => void apply("undo")}
          testId="history-undo"
        >
          {undo === null ? "Undo" : `Undo: ${undo}`}
        </MenuItem>
        <MenuItem
          icon={<Redo2 size={14} aria-hidden="true" />}
          disabled={busy || redo === null}
          onClick={() => void apply("redo")}
          testId="history-redo"
        >
          {redo === null ? "Redo" : `Redo: ${redo}`}
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  );
}
