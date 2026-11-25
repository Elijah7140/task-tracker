import type { TrayCardSize } from "@task-tracker/contracts";
import { ExternalLink, PictureInPicture2, Pin } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { Tooltip } from "../ui/tooltip.js";
import type { TrayCardFeedback } from "./use-tray-card-actions.js";

type Size = typeof TrayCardSize.Type;

/** Where the stack is drawn: the tray card by the icon, or its popped-out window. */
export type TrayCardLayout = "card" | "window";

/** Asks whether to complete the open sub-items too, under the card. */
function SubItemsQuestion({ feedback }: { readonly feedback: TrayCardFeedback }) {
  const { pending } = feedback;
  if (pending === null) {
    return null;
  }
  const noun = pending.count === 1 ? "sub-item" : "sub-items";
  const question = `Also complete ${pending.count} open ${noun} of ${pending.node.item.title}?`;
  return (
    <div
      role="group"
      aria-label="Complete sub-items"
      data-testid="tray-card-confirmation"
      className="flex flex-col gap-2 rounded-control border border-line bg-canvas p-2.5 text-[13px]"
    >
      <p>{pending.changed ? `Open sub-items changed. ${question}` : question}</p>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" onClick={feedback.cancel} data-testid="tray-card-confirm-cancel">
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={feedback.busy}
          onClick={() => void feedback.confirm()}
          data-testid="tray-card-confirm"
        >
          Complete
        </Button>
      </div>
    </div>
  );
}

/** The sub-items question or the reason a write of the card failed, under the card. */
export function TrayCardFeedbackPanel({ feedback }: { readonly feedback: TrayCardFeedback }) {
  return (
    <>
      <SubItemsQuestion feedback={feedback} />
      {feedback.message === null ? null : (
        <p role="alert" data-testid="tray-card-message" className="text-[13px] text-danger">
          {feedback.message}
        </p>
      )}
    </>
  );
}

/** Props for {@link TrayItemCaption}. */
export interface TrayItemCaptionProps {
  /** "Project › Folder", where the item lives. */
  readonly areaPath: string;
  /** "INC-42 Fix invoice view", the item's spoken name. */
  readonly label: string;
  readonly onOpen: () => void;
}

/** The line above a tray card: where the item lives, and Open in the main window. */
export function TrayItemCaption({ areaPath, label, onOpen }: TrayItemCaptionProps) {
  return (
    <div className="flex items-center gap-1.5 pl-1">
      <span data-testid="tray-card-area" className="min-w-0 flex-1 truncate text-xs text-fg-muted">
        {areaPath}
      </span>
      <Tooltip content="Open in Task Tracker">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${label} in Task Tracker`}
          data-testid="tray-card-open"
          className="flex h-6 shrink-0 cursor-default items-center gap-1 rounded-control px-1.5 text-xs text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus"
        >
          Open
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}

/** A tray card whose area is still loading, holding about a card's height. */
export function TrayItemPlaceholder() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading item"
      data-testid="tray-card-loading"
      className="h-24 animate-pulse rounded-card bg-hover"
    />
  );
}

/**
 * The stack's list of cards. The tray card stacks them one card wide; the popped-out
 * window lays them out in as many columns as its width fits.
 */
export function InProgressCards({
  children,
  layout,
}: {
  readonly children: ReactNode;
  readonly layout: TrayCardLayout;
}) {
  return (
    <ul
      aria-label="In progress items"
      data-testid="tray-card-list"
      className={cx(
        "m-0 list-none p-0",
        layout === "card"
          ? "flex flex-col gap-3"
          : "grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] items-start gap-3",
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

/** The frame's elements that size the tray card window (§7.18). */
export interface TrayCardFrameRefs {
  readonly frame: RefObject<HTMLElement | null>;
  readonly body: RefObject<HTMLDivElement | null>;
  readonly content: RefObject<HTMLDivElement | null>;
}

/** Props for {@link TrayCardFrame}. */
export interface TrayCardFrameProps {
  readonly children: ReactNode;
  /** The tray card is one card wide; the popped-out window fills its window. */
  readonly layout: TrayCardLayout;
  /** Full or Compact cards (§7.18). */
  readonly size: Size;
  /** How many items are in progress, shown beside the caption once loaded. */
  readonly count: number | null;
  /** Pop out on the card, Keep on top in the window. */
  readonly action: ReactNode;
  readonly refs?: TrayCardFrameRefs | undefined;
}

/** The card window's width for each size, in CSS pixels. */
const CARD_WIDTHS: Readonly<Record<Size, string>> = {
  Full: "w-[400px]",
  Compact: "w-[300px]",
};

/**
 * The stack's frame: the "In progress" caption, the count and the header action over a
 * body that scrolls once the window can grow no taller. Compact cards draw everything
 * smaller, type and padding alike.
 */
export function TrayCardFrame({ children, layout, size, count, action, refs }: TrayCardFrameProps) {
  return (
    <section
      ref={refs?.frame}
      aria-labelledby="tray-card-caption"
      data-testid="tray-card"
      data-layout={layout}
      data-size={size}
      className={cx(
        "flex flex-col bg-raised text-sm text-fg",
        layout === "card" ? `max-h-dvh border border-line ${CARD_WIDTHS[size]}` : "h-dvh",
      )}
    >
      <header className="flex shrink-0 items-center gap-1.5 pt-2.5 pr-2 pb-1.5 pl-4">
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
      <div ref={refs?.body} data-testid="tray-card-body" className="min-h-0 flex-1 overflow-y-auto">
        <div
          ref={refs?.content}
          className={cx("px-3 pb-3", size === "Compact" && "[zoom:0.86]")}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
