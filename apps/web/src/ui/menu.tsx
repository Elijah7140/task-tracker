import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cx } from "./class-names.js";
import { Tooltip } from "./tooltip.js";

/** Props for {@link MenuContent}. */
export interface MenuContentProps {
  readonly children: ReactNode;
  readonly testId?: string | undefined;
}

/** The shared look of a menu's floating panel. */
export const MENU_POPUP_CLASS =
  "min-w-44 rounded-card border border-line bg-raised p-1 text-fg shadow-raised outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0";

/** The floating panel of a Base UI menu, aligned to the trigger's end edge. */
export function MenuContent({ children, testId }: MenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner align="end" sideOffset={4} className="z-50 outline-none">
        <Menu.Popup data-testid={testId} className={MENU_POPUP_CLASS}>
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
        <ContextMenu.Popup data-testid={testId} className={MENU_POPUP_CLASS}>
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
  /**
   * The keyboard shortcut shown at the row's end, such as "Ctrl+Z", with its
   * `aria-keyshortcuts` value, such as "Control+Z", for assistive technology.
   */
  readonly shortcut?: { readonly label: string; readonly keys: string } | undefined;
  /**
   * Why a disabled row is unavailable. It appears as a tooltip on hover or
   * focus and is the row's accessible description. Ignored while enabled.
   */
  readonly disabledReason?: string | null | undefined;
}

/**
 * A menu row with an optional leading icon and trailing shortcut. A disabled
 * row with a reason explains itself in a tooltip.
 */
export function MenuItem(props: MenuItemProps) {
  const reasonId = useId();
  const { disabled = false, disabledReason, testId } = props;
  if (!disabled || disabledReason == null) {
    return <MenuItemRow {...props} />;
  }
  return (
    <Tooltip
      content={disabledReason}
      testId={testId === undefined ? undefined : `${testId}-reason`}
    >
      <div>
        <MenuItemRow {...props} describedBy={reasonId} />
        <span id={reasonId} hidden>
          {disabledReason}
        </span>
      </div>
    </Tooltip>
  );
}

function MenuItemRow({
  children,
  icon,
  tone = "default",
  disabled = false,
  onClick,
  testId,
  shortcut,
  describedBy,
}: MenuItemProps & { readonly describedBy?: string }) {
  return (
    <Menu.Item
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      aria-keyshortcuts={shortcut?.keys}
      aria-describedby={describedBy}
      className={cx(
        "flex h-8 cursor-default items-center gap-2 rounded-[0.375rem] px-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45 data-highlighted:bg-hover",
        tone === "danger" ? "text-danger" : "text-fg",
      )}
    >
      <span className="flex size-4 items-center justify-center opacity-80">{icon}</span>
      {children}
      {shortcut === undefined ? null : (
        <kbd aria-hidden="true" className="ml-auto pl-6 font-sans text-xs text-fg-subtle">
          {shortcut.label}
        </kbd>
      )}
    </Menu.Item>
  );
}

/** A thin divider separating groups of menu actions. */
export function MenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}

const itemClass =
  "flex h-8 cursor-default items-center gap-2 rounded-[0.375rem] px-2 text-sm text-fg outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45 data-highlighted:bg-hover";

/** Props for {@link MenuSubmenu}. */
export interface MenuSubmenuProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string | undefined;
  readonly popupTestId?: string | undefined;
}

/** A row that opens a nested menu to its side by pointer hover, click, Enter or ArrowRight. */
export function MenuSubmenu({ label, icon, children, testId, popupTestId }: MenuSubmenuProps) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger
        data-testid={testId}
        className={cx(itemClass, "data-popup-open:bg-hover")}
      >
        <span className="flex size-4 items-center justify-center opacity-80">{icon}</span>
        {label}
        <ChevronRight size={14} aria-hidden="true" className="ml-auto text-fg-subtle" />
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={2} alignOffset={-4} className="z-50 outline-none">
          <Menu.Popup data-testid={popupTestId} className={MENU_POPUP_CLASS}>
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

/** Props for {@link MenuRadioGroup}. */
export interface MenuRadioGroupProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly children: ReactNode;
}

/** A set of {@link MenuRadioItem} rows of which exactly one is checked. */
export function MenuRadioGroup({ value, onValueChange, children }: MenuRadioGroupProps) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(next: string) => onValueChange(next)}>
      {children}
    </Menu.RadioGroup>
  );
}

/** Props for {@link MenuRadioItem}. */
export interface MenuRadioItemProps {
  readonly value: string;
  readonly children: ReactNode;
  readonly testId?: string | undefined;
}

/** A checkable menu row that shows a check mark and reports its checked state to assistive tech. */
export function MenuRadioItem({ value, children, testId }: MenuRadioItemProps) {
  return (
    <Menu.RadioItem value={value} closeOnClick data-testid={testId} className={itemClass}>
      <span className="flex size-4 items-center justify-center text-accent">
        <Menu.RadioItemIndicator>
          <Check size={14} aria-hidden="true" />
        </Menu.RadioItemIndicator>
      </span>
      <span className="truncate">{children}</span>
    </Menu.RadioItem>
  );
}
