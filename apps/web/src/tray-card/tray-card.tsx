import type { InProgressItem } from "@task-tracker/contracts";
import { Circle, PictureInPicture2, Pin } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { formatFloatingDate, formatFloatingDateTime } from "../format/item-dates.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { Tooltip } from "../ui/tooltip.js";
import { UrgencyBadge } from "../workspace/urgency-badge.js";
import type { TrayCardCompletion } from "./use-tray-card-completion.js";

type Item = typeof InProgressItem.Type;

/** "Due Nov 20, 2026, 2:30 PM", or null for an item without a due date. */
export function describeDue(item: Pick<Item, "dueDate" | "dueTime">): string | null {
  if (item.dueDate === null) {
    return null;
  }
  const when =
    item.dueTime === null
      ? formatFloatingDate(item.dueDate)
      : formatFloatingDateTime(item.dueDate, item.dueTime);
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

/** Urgency, priority, due date and, when the stack mixes statuses, the status. */
function RowFacts({ item, showStatus }: { readonly item: Item; readonly showStatus: boolean }) {
  const due = describeDue(item);
  const hasFacts =
    item.urgency !== "None" || item.priorityName !== null || due !== null || showStatus;
  if (!hasFacts) {
    return null;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
      <UrgencyBadge urgency={item.urgency} />
      {showStatus ? <Chip testId="tray-card-status">{item.statusName}</Chip> : null}
      {item.priorityName === null ? null : (
        <Chip testId="tray-card-priority">{item.priorityName}</Chip>
      )}
      {due === null ? null : (
        <span data-testid="tray-card-due" className="text-xs text-fg-muted">
          {due}
        </span>
      )}
    </span>
  );
}

/** Asks whether to complete the open sub-items too, under the row. */
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
      className="ml-7 flex flex-col gap-2 rounded-control border border-line bg-canvas p-2.5 text-[13px]"
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

/** The circle that completes a row's item. Unlike workspace circles it takes a Tab stop. */
function CompleteButton({
  label,
  completion,
}: {
  readonly label: string;
  readonly completion: TrayCardCompletion;
}) {
  return (
    <Tooltip content="Mark complete">
      <button
        type="button"
        aria-label={`Complete ${label}`}
        disabled={completion.busy}
        onClick={() => void completion.complete()}
        data-testid="tray-card-complete"
        className="mt-px grid size-5 shrink-0 cursor-default place-items-center rounded-full text-control-outline transition-colors outline-none hover:bg-pressed hover:text-fg-muted focus-visible:ring-3 focus-visible:ring-focus disabled:opacity-50"
      >
        <Circle size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

/** "INC-42 Fix invoice view", the name screen readers use for a row. */
function rowLabel(item: Item): string {
  return item.ticketNumber === null ? item.title : `${item.ticketNumber} ${item.title}`;
}

/** Props for {@link InProgressRow}. */
export interface InProgressRowProps {
  readonly item: Item;
  /** Shows the status chip, for a stack that mixes statuses. */
  readonly showStatus: boolean;
  readonly completion: TrayCardCompletion;
  readonly onOpen: () => void;
}

/**
 * One item of the in-progress stack (§7.18): a circle that completes it, then
 * the ticket number and title over the area path, urgency, priority and due
 * date. Clicking the text opens the item in the main window.
 */
export function InProgressRow({ item, showStatus, completion, onOpen }: InProgressRowProps) {
  const label = rowLabel(item);
  return (
    <li
      data-testid="tray-card-row"
      data-item-id={item.itemId}
      className="flex flex-col gap-1.5 border-b border-line py-2 last:border-b-0"
    >
      <div className="flex items-start gap-2">
        <CompleteButton label={label} completion={completion} />
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${label} in Task Tracker`}
          data-testid="tray-card-open"
          className="-my-0.5 flex min-w-0 flex-1 cursor-default flex-col gap-0.5 rounded-control px-1 py-0.5 text-left outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus"
        >
          <span data-testid="tray-card-title" className="line-clamp-2 leading-snug break-words">
            {item.ticketNumber === null ? null : (
              <span data-testid="tray-card-ticket" className="mr-1.5 font-medium text-fg-muted">
                {item.ticketNumber}
              </span>
            )}
            {item.title}
          </span>
          <span data-testid="tray-card-area" className="truncate text-xs text-fg-muted">
            {item.areaPath}
          </span>
          <RowFacts item={item} showStatus={showStatus} />
        </button>
      </div>
      <SubItemsQuestion completion={completion} />
      {completion.message === null ? null : (
        <p role="alert" data-testid="tray-card-message" className="ml-7 text-[13px] text-danger">
          {completion.message}
        </p>
      )}
    </li>
  );
}

/** The stack's list. In the tray card it scrolls past a fixed height. */
export function InProgressList({
  children,
  scroll,
}: {
  readonly children: ReactNode;
  readonly scroll: "card" | "window";
}) {
  return (
    <ul
      aria-label="In progress items"
      data-testid="tray-card-list"
      className={cx(
        "-mx-1 flex flex-col overflow-y-auto px-1",
        scroll === "card" ? "max-h-[30rem]" : "min-h-0 flex-1",
      )}
    >
      {children}
    </ul>
  );
}

/** The card with nothing in progress, explaining how items get there. */
export function TrayCardEmpty() {
  return (
    <div data-testid="tray-card-empty" className="flex flex-col gap-1">
      <p className="font-semibold">Nothing in progress.</p>
      <p className="text-[13px] text-fg-muted">
        Set an item&apos;s status to In progress. App Settings chooses which statuses count as in
        progress.
      </p>
    </div>
  );
}

/** The tray card's Pop out button, which moves the stack into its own window. */
export function PopOutButton({ onPopOut }: { readonly onPopOut: () => void }) {
  return (
    <Tooltip content="Pop out into a window">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Pop out"
        onClick={onPopOut}
        data-testid="tray-card-pop-out"
      >
        <PictureInPicture2 size={14} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}

/** The popped-out window's Keep on top toggle. */
export function KeepOnTopButton({
  onTop,
  onToggle,
}: {
  readonly onTop: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <Tooltip content={onTop ? "Stop keeping on top" : "Keep on top of other windows"}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Keep on top"
        aria-pressed={onTop}
        onClick={onToggle}
        data-testid="tray-card-keep-on-top"
        className={onTop ? "text-accent" : undefined}
      >
        <Pin size={14} aria-hidden="true" fill={onTop ? "currentColor" : "none"} />
      </Button>
    </Tooltip>
  );
}

/** Props for {@link TrayCardFrame}. */
export interface TrayCardFrameProps {
  readonly children: ReactNode;
  /** The tray card is a fixed-width card; the popped-out window fills its window. */
  readonly layout: "card" | "window";
  /** How many items are in progress, shown beside the caption once loaded. */
  readonly count: number | null;
  /** Pop out on the card, Keep on top in the window. */
  readonly action: ReactNode;
  readonly frameRef?: RefObject<HTMLElement | null> | undefined;
}

/** The stack's frame: the "In progress" caption, the count and the header action. */
export function TrayCardFrame({ children, layout, count, action, frameRef }: TrayCardFrameProps) {
  return (
    <section
      ref={frameRef}
      aria-labelledby="tray-card-caption"
      data-testid="tray-card"
      data-layout={layout}
      className={cx(
        "flex flex-col gap-1.5 bg-raised px-4 pt-2.5 pb-3 text-sm text-fg",
        layout === "card" ? "w-80 border border-line" : "h-dvh",
      )}
    >
      <header className="-mr-2 flex items-center gap-1.5">
        <p
          id="tray-card-caption"
          className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
        >
          In progress
        </p>
        {count === null ? null : (
          <span data-testid="tray-card-count" className="text-[11px] text-fg-subtle">
            {count}
          </span>
        )}
        <span className="ml-auto">{action}</span>
      </header>
      {children}
    </section>
  );
}
