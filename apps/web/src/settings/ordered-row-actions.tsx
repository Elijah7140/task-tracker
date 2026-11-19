import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil } from "lucide-react";
import type { ReactElement } from "react";
import { Button } from "../ui/button.js";
import { Tooltip } from "../ui/tooltip.js";

/** Props for {@link OrderedRowActions}. */
export interface OrderedRowActionsProps {
  /** The row's visible name, used in accessible labels. */
  readonly name: string;
  /** What the row is. Choices carry the word in their labels and tooltips, as in the legacy app. */
  readonly kind: "field" | "choice";
  readonly isArchived: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRename: () => void;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
}

function IconAction({
  tooltip,
  label,
  testId,
  disabled = false,
  onClick,
  icon,
}: {
  readonly tooltip: string;
  readonly label: string;
  readonly testId: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly icon: ReactElement;
}) {
  return (
    <Tooltip content={tooltip}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
        data-testid={testId}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}

/**
 * Move, rename and archive-or-restore buttons for one row of a field or
 * choice list. Archived rows keep their place but cannot move.
 */
export function OrderedRowActions({
  name,
  kind,
  isArchived,
  canMoveUp,
  canMoveDown,
  onMove,
  onRename,
  onArchive,
  onRestore,
}: OrderedRowActionsProps) {
  const noun = kind === "choice" ? "choice " : "";
  const tip = (verb: string, direction?: string) =>
    [verb, kind === "choice" ? "choice" : undefined, direction].filter(Boolean).join(" ");
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconAction
        tooltip={tip("Move", "up")}
        label={`Move ${noun}${name} up`}
        testId={`${kind}-move-up`}
        disabled={isArchived || !canMoveUp}
        onClick={() => onMove(-1)}
        icon={<ArrowUp size={14} aria-hidden="true" />}
      />
      <IconAction
        tooltip={tip("Move", "down")}
        label={`Move ${noun}${name} down`}
        testId={`${kind}-move-down`}
        disabled={isArchived || !canMoveDown}
        onClick={() => onMove(1)}
        icon={<ArrowDown size={14} aria-hidden="true" />}
      />
      <IconAction
        tooltip={tip("Rename")}
        label={`Rename ${noun}${name}`}
        testId={`${kind}-rename`}
        onClick={onRename}
        icon={<Pencil size={14} aria-hidden="true" />}
      />
      {isArchived ? (
        <IconAction
          tooltip={tip("Restore")}
          label={`Restore ${noun}${name}`}
          testId={`${kind}-restore`}
          onClick={onRestore}
          icon={<ArchiveRestore size={14} aria-hidden="true" />}
        />
      ) : (
        <IconAction
          tooltip={tip("Archive")}
          label={`Archive ${noun}${name}`}
          testId={`${kind}-archive`}
          onClick={onArchive}
          icon={<Archive size={14} aria-hidden="true" />}
        />
      )}
    </div>
  );
}
