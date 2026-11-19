import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { cx } from "./class-names.js";

/** Props for {@link MenuContent}. */
export interface MenuContentProps {
  readonly children: ReactNode;
  readonly testId?: string | undefined;
}

const popupClass =
  "min-w-44 rounded-card border border-line bg-raised p-1 text-fg shadow-raised outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0";

/** The floating panel of a Base UI menu, aligned to the trigger's end edge. */
export function MenuContent({ children, testId }: MenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner align="end" sideOffset={4} className="z-50 outline-none">
        <Menu.Popup data-testid={testId} className={popupClass}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

/** The floating panel of a Base UI context menu, opened at the pointer. Use {@link MenuItem} rows. */
export function ContextMenuContent({ children, testId }: MenuContentProps) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-50 outline-none">
        <ContextMenu.Popup data-testid={testId} className={popupClass}>
          {children}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

/** Props for {@link MenuItem}. */
export interface MenuItemProps {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly tone?: "default" | "danger" | undefined;
  readonly disabled?: boolean | undefined;
  readonly onClick: () => void;
  readonly testId?: string | undefined;
}

/** A menu row with an optional leading icon. */
export function MenuItem({
  children,
  icon,
  tone = "default",
  disabled = false,
  onClick,
  testId,
}: MenuItemProps) {
  return (
    <Menu.Item
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cx(
        "flex h-8 cursor-default items-center gap-2 rounded-[0.375rem] px-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45 data-highlighted:bg-hover",
        tone === "danger" ? "text-danger" : "text-fg",
      )}
    >
      <span className="flex size-4 items-center justify-center opacity-80">{icon}</span>
      {children}
    </Menu.Item>
  );
}

/** A thin divider separating groups of menu actions. */
export function MenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}
