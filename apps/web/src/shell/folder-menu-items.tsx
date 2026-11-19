import { ArrowRightLeft, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { MenuItem } from "../ui/menu.js";
import type { Folder } from "../workspace/folder-outline.js";
import type { FolderActions } from "../workspace/use-folder-actions.js";

/** Props for {@link FolderMenuItems}. */
export interface FolderMenuItemsProps {
  readonly folder: Folder;
  readonly actions: FolderActions;
}

/** The folder actions shared by a folder's overflow and context menus. */
export function FolderMenuItems({ folder, actions }: FolderMenuItemsProps) {
  return (
    <>
      <MenuItem
        icon={<FolderPlus size={14} />}
        onClick={() => void actions.createFolder(folder.id)}
        testId="folder-new-subfolder"
      >
        New folder
      </MenuItem>
      <MenuItem
        icon={<Pencil size={14} />}
        onClick={() => void actions.renameFolder(folder)}
        testId="folder-rename"
      >
        Rename
      </MenuItem>
      <MenuItem
        icon={<ArrowRightLeft size={14} />}
        onClick={() => void actions.moveFolder(folder)}
        testId="folder-move"
      >
        Move
      </MenuItem>
      <MenuItem
        icon={<Trash2 size={14} />}
        tone="danger"
        onClick={() => void actions.deleteFolder(folder)}
        testId="folder-delete"
      >
        Delete
      </MenuItem>
    </>
  );
}
