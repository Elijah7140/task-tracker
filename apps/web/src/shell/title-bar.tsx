import { RemindersPopover } from "../reminders/reminders-popover.js";
import { MenuBar, type MenuBarProps } from "./menu-bar.js";

/**
 * The bar across the top of the window, below the system title bar that
 * names the app (§8). It holds the menu bar, and the
 * Reminders panel drops down from its right end.
 */
export function TitleBar(props: MenuBarProps) {
  return (
    <header
      data-testid="title-bar"
      className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-sidebar pr-3 pl-3.5"
    >
      <MenuBar {...props} />
      <RemindersPopover runGuards={props.runGuards} />
    </header>
  );
}
