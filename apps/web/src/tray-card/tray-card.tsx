import { trimText } from "@task-tracker/contracts";
import type { CurrentItemCard } from "@task-tracker/contracts";
import { CircleCheck, SquareArrowOutUpRight } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { formatFloatingDate, formatFloatingDateTime } from "../format/item-dates.js";
import { Button } from "../ui/button.js";
import type { TrayCardCompletion } from "./use-tray-card-completion.js";

type Card = typeof CurrentItemCard.Type;

/** "Due Nov 20, 2026, 2:30 PM", or null for an item without a due date. */
export function describeDue(card: Pick<Card, "dueDate" | "dueTime">): string | null {
  if (card.dueDate === null) {
    return null;
  }
  const when =
    card.dueTime === null
      ? formatFloatingDate(card.dueDate)
      : formatFloatingDateTime(card.dueDate, card.dueTime);
  return `Due ${when}`;
}

function Chip({ children, testId }: { readonly children: ReactNode; readonly testId: string }) {
  return (
    <span
      data-testid={testId}
      className="max-w-full truncate rounded-full bg-hover px-2 py-0.5 text-xs text-fg-muted"
    >
      {children}
    </span>
  );
}

/** The Completed chip, status, priority and due date line; nothing when the item has none. */
function CardFacts({ card }: { readonly card: Card }) {
  const due = describeDue(card);
  if (!card.isCompleted && card.statusName === null && card.priorityName === null && !due) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {card.isCompleted ? <Chip testId="tray-card-completed">Completed</Chip> : null}
      {card.statusName === null ? null : <Chip testId="tray-card-status">{card.statusName}</Chip>}
      {card.priorityName === null ? null : (
        <Chip testId="tray-card-priority">{card.priorityName}</Chip>
      )}
      {due === null ? null : (
        <span data-testid="tray-card-due" className="text-xs text-fg-muted">
          {due}
        </span>
      )}
    </div>
  );
}

/** Asks whether to complete the open sub-items too, inside the card. */
function SubItemsQuestion({ completion }: { readonly completion: TrayCardCompletion }) {
  const { pending } = completion;
  if (pending === null) {
    return null;
  }
  const noun = pending.count === 1 ? "sub-item" : "sub-items";
  const question = `Also complete ${pending.count} open ${noun}?`;
  return (
    <div
      role="group"
      aria-label="Complete sub-items"
      data-testid="tray-card-confirmation"
      className="flex flex-col gap-2 rounded-control border border-line bg-canvas p-2.5 text-[13px]"
    >
      <p>{pending.changed ? `Open sub-items changed. ${question}` : question}</p>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" onClick={completion.cancel} data-testid="tray-card-confirm-cancel">
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void completion.confirm()}
          data-testid="tray-card-confirm"
        >
          Complete
        </Button>
      </div>
    </div>
  );
}

/** Props for {@link TrayCardItem}. */
export interface TrayCardItemProps {
  readonly card: Card;
  readonly completion: TrayCardCompletion;
  readonly onOpen: () => void;
}

/**
 * The current item on the tray card (§7.18): title, area path, Completed chip,
 * status, priority, due date, the first lines of the notes, Mark complete and
 * Open in Task Tracker.
 */
export function TrayCardItem({ card, completion, onOpen }: TrayCardItemProps) {
  const notes = trimText(card.description ?? "");
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h1
          data-testid="tray-card-title"
          className="text-[15px] leading-snug font-semibold break-words"
        >
          {card.title}
        </h1>
        <p
          data-testid="tray-card-area"
          title={card.areaPath}
          className="truncate text-xs text-fg-muted"
        >
          {card.areaPath}
        </p>
      </div>
      <CardFacts card={card} />
      {notes === "" ? null : (
        <p
          data-testid="tray-card-notes"
          className="line-clamp-6 text-xs leading-relaxed break-words whitespace-pre-line text-fg-muted"
        >
          {notes}
        </p>
      )}
      <SubItemsQuestion completion={completion} />
      {completion.message === null ? null : (
        <p role="alert" data-testid="tray-card-message" className="text-[13px] text-danger">
          {completion.message}
        </p>
      )}
      <div className="flex justify-end gap-1.5 pt-1">
        {card.isCompleted ? null : (
          <Button
            size="sm"
            disabled={completion.busy}
            onClick={() => void completion.complete()}
            data-testid="tray-card-complete"
          >
            <CircleCheck size={13} aria-hidden="true" />
            Mark complete
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={onOpen} data-testid="tray-card-open">
          <SquareArrowOutUpRight size={13} aria-hidden="true" />
          Open in Task Tracker
        </Button>
      </div>
    </>
  );
}

/** The card with no current item, explaining how to choose one. */
export function TrayCardEmpty() {
  return (
    <div data-testid="tray-card-empty" className="flex flex-col gap-1">
      <p className="font-semibold">No current item.</p>
      <p className="text-[13px] text-fg-muted">
        Right-click an item in Task Tracker and choose Set as current item.
      </p>
    </div>
  );
}

/** The card's frame: a fixed width and the "Current item" caption above its contents. */
export function TrayCardFrame({
  children,
  frameRef,
}: {
  readonly children: ReactNode;
  readonly frameRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <section
      ref={frameRef}
      aria-labelledby="tray-card-caption"
      data-testid="tray-card"
      className="flex w-80 flex-col gap-2.5 border border-line bg-raised p-4 text-sm text-fg"
    >
      <p
        id="tray-card-caption"
        className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
      >
        Current item
      </p>
      {children}
    </section>
  );
}
