import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";

/** Props for {@link Popover}. */
export interface PopoverProps {
  /** The trigger, rendered in place of Base UI's default button. Give it an accessible name. */
  readonly trigger: ReactElement;
  /** The popup's heading, which also names the dialog. */
  readonly title: string;
  readonly children: ReactNode;
  readonly testId?: string | undefined;
}

/**
 * A non-modal panel below its trigger for reference content, such as syntax help.
 * Escape or a click outside closes it and returns focus to the trigger.
 */
export function Popover({ trigger, title, children, testId }: PopoverProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner align="end" sideOffset={6} className="z-50 outline-none">
          <BasePopover.Popup
            data-testid={testId}
            className="max-w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-raised p-4 text-fg shadow-raised outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <BasePopover.Title className="mb-3 text-sm font-semibold text-fg">
              {title}
            </BasePopover.Title>
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
