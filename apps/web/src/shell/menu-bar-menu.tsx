import { Menu } from "@base-ui/react/menu";
import { type ReactNode, useRef } from "react";
import { MENU_POPUP_CLASS } from "../ui/menu.js";
import { focusAfterMenuCommand, MENU_BAR_POPUP_ATTRIBUTE } from "./menu-bar-focus.js";

/** Props for {@link MenuBarMenu}. */
export interface MenuBarMenuProps {
  /** The menu's name, such as "File". */
  readonly label: string;
  /** The access key: the first letter of the label, opened with Alt and that letter. */
  readonly accessKey: string;
  readonly disabled?: boolean | undefined;
  readonly testId: string;
  readonly popupTestId: string;
  readonly children: ReactNode;
}

const TRIGGER_CLASS =
  "flex h-7 cursor-default items-center rounded-control px-2.5 text-[13px] text-fg-muted outline-none select-none transition-colors duration-100 hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg data-disabled:opacity-45 data-disabled:hover:bg-transparent data-popup-open:bg-pressed data-popup-open:text-fg";

/** Underlines the access key while the menu bar has keyboard focus, as desktop menus do. */
function TriggerLabel({ label }: { readonly label: string }) {
  return (
    <span>
      <span className="group-has-focus-visible/menubar:underline">{label.slice(0, 1)}</span>
      {label.slice(1)}
    </span>
  );
}

/**
 * One top-level menu of the menu bar. Choosing a command returns focus to
 * where it was before the menu bar, unless the command moved focus itself;
 * Escape closes the menu and leaves focus on its name.
 */
export function MenuBarMenu(props: MenuBarMenuProps) {
  const { label, accessKey, disabled = false, testId, popupTestId, children } = props;
  const closedByCommand = useRef(false);
  return (
    <Menu.Root
      disabled={disabled}
      onOpenChange={(open, details) => {
        closedByCommand.current = !open && details.reason === "item-press";
      }}
    >
      <Menu.Trigger data-testid={testId} data-access-key={accessKey} className={TRIGGER_CLASS}>
        <TriggerLabel label={label} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={2} className="z-50 outline-none">
          <Menu.Popup
            data-testid={popupTestId}
            {...{ [MENU_BAR_POPUP_ATTRIBUTE]: "" }}
            finalFocus={() => (closedByCommand.current ? focusAfterMenuCommand() : true)}
            className={MENU_POPUP_CLASS}
          >
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
