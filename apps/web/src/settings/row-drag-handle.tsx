import { GripVertical } from "lucide-react";
import type { PointerEvent } from "react";

/** Props for {@link RowDragHandle}. */
export interface RowDragHandleProps {
  readonly label: string;
  readonly testId: string;
  readonly onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}

/**
 * The grip that starts a pointer drag of its row. It stays out of the tab
 * order because focused rows reorder with Alt+Arrow keys.
 */
export function RowDragHandle({ label, testId, onPointerDown }: RowDragHandleProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      data-testid={testId}
      onPointerDown={onPointerDown}
      className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-[0.25rem] text-fg-subtle hover:bg-hover hover:text-fg active:cursor-grabbing"
    >
      <GripVertical size={14} aria-hidden="true" />
    </button>
  );
}
