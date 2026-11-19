import { CalendarArrowRight } from "lucide-react";
import { MenuItem } from "../ui/menu.js";
import {
  PUSH_BACK_SHORTCUT_HINT,
  pushBackReason,
  type PushBackState,
} from "./push-back-availability.js";

/** Props for {@link PushBackMenuItem}. */
export interface PushBackMenuItemProps {
  readonly state: PushBackState;
  readonly onPushBack: () => void;
}

/**
 * "Push back one day" in every item row menu: the workspace tree and cards,
 * Search and Calendar (§7.14). A completed or undated item shows it disabled
 * with the reason as a tooltip.
 */
export function PushBackMenuItem({ state, onPushBack }: PushBackMenuItemProps) {
  const reason = pushBackReason(state);
  return (
    <MenuItem
      icon={<CalendarArrowRight size={14} />}
      disabled={reason !== null}
      disabledReason={reason}
      onClick={onPushBack}
      shortcut={PUSH_BACK_SHORTCUT_HINT}
      testId="item-menu-push-back"
    >
      Push back one day
    </MenuItem>
  );
}
