import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { cx } from "./class-names.js";

/** Props for {@link MenuContent}. */
export interface MenuContentProps {
  readonly children: ReactNode;
  readonly testId?: string | undefined;
}

/** The floating panel of a Base UI menu, aligned to the trigger's end edge. */
export function MenuContent({ children, testId }: MenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner align="end" sideOffset={4} className="z-50 outline-none">
        <Menu.Popup
          data-testid={testId}
          className="min-w-44 rounded-card border border-line bg-raised p-1 text-fg shadow-raised outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

/** Props for {@link MenuItem}. */
export interface MenuItemProps {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly tone?: "default" | "danger" | undefined;
  readonly onClick: () => void;
  readonly testId?: string | undefined;
}

/** A menu row with an optional leading icon. */
export function MenuItem({ children, icon, tone = "default", onClick, testId }: MenuItemProps) {
  return (
    <Menu.Item
      onClick={onClick}
      data-testid={testId}
      className={cx(
        "flex h-8 cursor-default items-center gap-2 rounded-[0.375rem] px-2 text-sm outline-none select-none data-highlighted:bg-hover",
        tone === "danger" ? "text-danger" : "text-fg",
      )}
    >
      <span className="flex size-4 items-center justify-center opacity-80">{icon}</span>
      {children}
    </Menu.Item>
  );
}
