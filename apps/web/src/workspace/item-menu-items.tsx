import {
  CircleCheck,
  CornerDownRight,
  FolderInput,
  IndentDecrease,
  IndentIncrease,
  ListPlus,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { MenuItem, MenuSeparator } from "../ui/menu.js";
import type { ItemNode } from "./item-outline.js";
import type { ItemActions } from "./use-item-actions.js";

/** Props for {@link ItemMenuItems}. */
export interface ItemMenuItemsProps {
  readonly node: ItemNode;
  readonly canIndent: boolean;
  readonly hasFolders: boolean;
  readonly actions: ItemActions;
}

/** Item actions shared by an item row's overflow menu and context menu. */
export function ItemMenuItems({ node, canIndent, hasFolders, actions }: ItemMenuItemsProps) {
  const completed = node.item.completedAtUtc !== null;
  return (
    <>
      <MenuItem
        icon={completed ? <RotateCcw size={14} /> : <CircleCheck size={14} />}
        onClick={() => void actions.toggleComplete(node)}
        testId="item-menu-toggle-complete"
      >
        {completed ? "Reopen" : "Complete"}
      </MenuItem>
      <MenuItem
        icon={<ListPlus size={14} />}
        onClick={() => void actions.addSubItem(node)}
        testId="item-menu-add-subitem"
      >
        Add sub-item
      </MenuItem>
      <MenuItem
        icon={<Pencil size={14} />}
        onClick={() => void actions.renameItem(node)}
        testId="item-menu-rename"
      >
        Rename
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<IndentIncrease size={14} />}
        disabled={!canIndent}
        onClick={() => void actions.indentItem(node)}
        testId="item-menu-indent"
      >
        Indent
      </MenuItem>
      <MenuItem
        icon={<IndentDecrease size={14} />}
        disabled={node.item.parentItemId === null}
        onClick={() => void actions.outdentItem(node)}
        testId="item-menu-outdent"
      >
        Outdent
      </MenuItem>
      <MenuItem
        icon={<CornerDownRight size={14} />}
        onClick={() => void actions.moveItemParent(node)}
        testId="item-menu-move-parent"
      >
        Move under…
      </MenuItem>
      {node.item.parentItemId === null ? (
        <MenuItem
          icon={<FolderInput size={14} />}
          disabled={!hasFolders}
          onClick={() => void actions.moveItemToArea(node)}
          testId="item-menu-move-area"
        >
          Move to area…
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem
        icon={<Trash2 size={14} />}
        tone="danger"
        onClick={() => void actions.deleteItem(node)}
        testId="item-menu-delete"
      >
        Delete
      </MenuItem>
    </>
  );
}
