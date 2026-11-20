import { Star, StarOff } from "lucide-react";
import { MenuItem } from "../ui/menu.js";
import { useCurrentItemId, useSetCurrentItem } from "./use-current-item.js";

/** Props for {@link CurrentItemMenuItem}. */
export interface CurrentItemMenuItemProps {
  readonly itemId: string;
  /**
   * Workspace cards and rows toggle between Set and Clear. Search, Calendar,
   * Today and Tickets rows only set the item, as in the legacy app (§7.18).
   */
  readonly mode: "toggle" | "set";
}

/** The "Set as current item" or "Clear current item" entry of an item's menu. */
export function CurrentItemMenuItem({ itemId, mode }: CurrentItemMenuItemProps) {
  const currentId = useCurrentItemId();
  const setCurrent = useSetCurrentItem();
  const clears = mode === "toggle" && currentId === itemId;
  return (
    <MenuItem
      icon={clears ? <StarOff size={14} /> : <Star size={14} />}
      onClick={() => void setCurrent(clears ? null : itemId)}
      testId="item-menu-current-item"
    >
      {clears ? "Clear current item" : "Set as current item"}
    </MenuItem>
  );
}
