import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

/** Props for {@link Tooltip}. */
export interface TooltipProps {
  /** The hint shown on hover or focus. Also give the trigger an accessible name. */
  readonly content: ReactNode;
  /** The trigger element, rendered in place of Base UI's default button. */
  readonly children: ReactElement;
  readonly testId?: string | undefined;
}

/** A small hint above its trigger. Pass a non-interactive element for decorative markers. */
export function Tooltip({ content, children, testId }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={300} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6} className="z-50">
          <BaseTooltip.Popup
            data-testid={testId}
            className="max-w-64 rounded-control bg-raised px-2 py-1 text-xs text-fg shadow-raised transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0"
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
