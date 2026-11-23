import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode, RefObject } from "react";
import { cx } from "./class-names.js";

/** Props for {@link Popover}. */
export interface PopoverProps {
  /** The trigger, rendered in place of Base UI's default button. Give it an accessible name. */
  readonly trigger: ReactElement;
  /** The popup's heading, which also names the dialog. */
  readonly title: string;
  /** Keeps the heading for screen readers only, when the content shows its own heading. */
  readonly titleHidden?: boolean | undefined;
  readonly children: ReactNode;
  readonly testId?: string | undefined;
  /** Controlled open state. Omit both `open` and `onOpenChange` to let the popover manage it. */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** The element that takes focus on open, instead of the popup's first focusable element. */
  readonly initialFocus?: RefObject<HTMLElement | null> | undefined;
}

/**
 * A non-modal panel below its trigger for reference content, such as syntax help,
 * or a small chooser such as the date picker.
 * Escape or a click outside closes it and returns focus to the trigger.
 */
export function Popover({
  trigger,
  title,
  titleHidden = false,
  children,
  testId,
  open,
  onOpenChange,
  initialFocus,
}: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner align="end" sideOffset={6} className="z-50 outline-none">
          <BasePopover.Popup
            data-testid={testId}
            initialFocus={initialFocus}
            className={cx(
              "max-w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-raised text-fg shadow-raised outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
              titleHidden ? "p-3" : "p-4",
            )}
          >
            <BasePopover.Title
              className={titleHidden ? "sr-only" : "mb-3 text-sm font-semibold text-fg"}
            >
              {title}
            </BasePopover.Title>
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
