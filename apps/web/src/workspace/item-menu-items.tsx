import {
  CircleCheck,
  CornerDownRight,
  Flag,
  FolderInput,
  IndentDecrease,
  IndentIncrease,
  ListPlus,
  Pencil,
  RepeatOff,
  RotateCcw,
  SkipForward,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { PriorityLevelProjection, StatusProjection } from "@task-tracker/contracts";
import { CurrentItemMenuItem } from "../current-item/current-item-menu-item.js";
import { MenuItem, MenuSeparator } from "../ui/menu.js";
import type { ItemNode } from "./item-outline.js";
import { ItemStatusMenu } from "./item-status-menu.js";
import { itemPushBackState } from "./push-back-availability.js";
import { PushBackMenuItem } from "./push-back-menu-item.js";
import { RowLookupMenu } from "./row-lookup-menu.js";
import type { ItemActions } from "./use-item-actions.js";

/** Props for {@link ItemMenuItems}. */
export interface ItemMenuItemsProps {
  readonly node: ItemNode;
  readonly canIndent: boolean;
  readonly hasFolders: boolean;
  readonly priorityLevels: ReadonlyArray<typeof PriorityLevelProjection.Type>;
  readonly statuses: ReadonlyArray<typeof StatusProjection.Type>;
  readonly actions: ItemActions;
}

/** "Skip this one" and "Stop repeating" for a repeating item (§7.11). */
function RepeatMenuItems({ node, actions }: Pick<ItemMenuItemsProps, "node" | "actions">) {
  if ((node.item.recurrence ?? null) === null) {
    return null;
  }
  return (
    <>
      <MenuItem
        icon={<SkipForward size={14} />}
        disabled={node.item.completedAtUtc !== null}
        onClick={() => void actions.skipRepeat(node)}
        testId="item-menu-skip-repeat"
      >
        Skip this one
      </MenuItem>
      <MenuItem
        icon={<RepeatOff size={14} />}
        onClick={() => void actions.stopRepeating(node)}
        testId="item-menu-stop-repeating"
      >
        Stop repeating
      </MenuItem>
    </>
  );
}

/** Item actions shared by an item row's overflow menu and context menu. */
export function ItemMenuItems({
  node,
  canIndent,
  hasFolders,
  priorityLevels,
  statuses,
  actions,
}: ItemMenuItemsProps) {
  const completed = node.item.completedAtUtc !== null;
  return (
    <>
      <MenuItem
        icon={<SquarePen size={14} />}
        onClick={() => actions.editItem(node)}
        testId="item-menu-edit"
      >
        Edit…
      </MenuItem>
      <RowLookupMenu
        label="Set priority"
        icon={<Flag size={14} />}
        entries={priorityLevels}
        currentId={node.item.priorityLevelId}
        onSelect={(id) => void actions.setPriority(node, id)}
        testId="item-menu-set-priority"
      />
      <MenuSeparator />
      <MenuItem
        icon={completed ? <RotateCcw size={14} /> : <CircleCheck size={14} />}
        onClick={() => void actions.toggleComplete(node)}
        testId="item-menu-toggle-complete"
      >
        {completed ? "Reopen" : "Complete"}
      </MenuItem>
      <ItemStatusMenu
        statuses={statuses}
        statusId={node.item.statusId}
        onChange={(statusId) => void actions.setStatus(node, statusId)}
      />
      <PushBackMenuItem
        state={itemPushBackState(node.item)}
        onPushBack={() => void actions.pushBack(node)}
      />
      <CurrentItemMenuItem itemId={node.item.id} mode="toggle" />
      <RepeatMenuItems node={node} actions={actions} />
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
