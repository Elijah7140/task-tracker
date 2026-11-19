import type { CSSProperties } from "react";
import { calendarNavProps } from "./calendar-grid-keys.js";
import type { CalendarOccurrence } from "./calendar-layout.js";
import { cx } from "../ui/class-names.js";

/** Props for {@link CalendarEntryButton}. */
export interface CalendarEntryButtonProps {
  readonly occurrence: CalendarOccurrence;
  readonly variant: "inline" | "block";
  /** Position among the day's focusable controls, for arrow-key navigation. */
  readonly navIndex: number;
  readonly onActivate: (occurrence: CalendarOccurrence) => void;
}

const URGENCY_TONES = {
  None: "border-line-strong bg-surface text-fg hover:bg-hover",
  Approaching:
    "border-urgency-approaching/35 bg-urgency-approaching-soft text-urgency-approaching hover:brightness-95",
  Imminent:
    "border-urgency-overdue/35 bg-urgency-overdue-soft text-urgency-overdue hover:brightness-95",
  Overdue:
    "border-urgency-overdue/45 bg-urgency-overdue-soft text-urgency-overdue hover:brightness-95",
} as const;

/**
 * One interactive calendar entry button in Month cells, the Week all-day row,
 * or the Week time grid. Urgency is always shown with a text label in addition
 * to color, overdue titles are bold, and short time blocks stay on one line (§7.4).
 */
export function CalendarEntryButton({
  occurrence,
  variant,
  navIndex,
  onActivate,
}: CalendarEntryButtonProps) {
  const { entry, isCompact, label, monthLabel, tooltip } = occurrence;
  const hasUrgency = entry.urgency !== "None";
  const isOverdue = entry.urgency === "Overdue";
  const tone = URGENCY_TONES[entry.urgency];

  const blockStyle: CSSProperties | undefined =
    variant === "block"
      ? {
          top: `${occurrence.topPx}px`,
          height: `${occurrence.heightPx}px`,
          left: `calc(${occurrence.leftFraction * 100}% + 1px)`,
          width: `calc(${occurrence.widthFraction * 100}% - 2px)`,
        }
      : undefined;

  return (
    <button
      type="button"
      onClick={() => onActivate(occurrence)}
      title={tooltip}
      aria-label={occurrence.accessibleLabel}
      aria-keyshortcuts={
        occurrence.isAllDay
          ? "Alt+ArrowLeft Alt+ArrowRight"
          : "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
      }
      {...calendarNavProps(occurrence.day, navIndex)}
      data-testid="calendar-entry"
      data-item-id={entry.itemId}
      data-entry-kind={entry.kind}
      data-urgency={entry.urgency}
      data-compact={variant === "block" && isCompact ? "true" : "false"}
      style={blockStyle}
      className={cx(
        "block overflow-hidden rounded-[0.3rem] border text-left text-xs leading-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
        tone,
        entry.isCompleted && "opacity-55",
        variant === "inline" && "w-full px-1.5 py-0.5",
        variant === "block" && "absolute z-10",
        variant === "block" && (isCompact ? "px-1.5 py-0" : "px-1.5 py-1"),
      )}
    >
      {variant === "inline" || isCompact ? (
        <span className="flex h-full items-center gap-1 overflow-hidden">
          {hasUrgency ? (
            <span
              data-testid="calendar-entry-urgency"
              className="max-w-[55%] shrink-0 truncate text-[11px] font-semibold"
            >
              {entry.urgency}
            </span>
          ) : null}
          <span className={cx("min-w-0 truncate", isOverdue && "font-semibold")}>
            {variant === "inline" ? monthLabel : label}
          </span>
        </span>
      ) : (
        <span className="flex flex-col gap-0.5 overflow-hidden">
          {hasUrgency ? (
            <span
              data-testid="calendar-entry-urgency"
              className="truncate text-[11px] font-semibold"
            >
              {entry.urgency}
            </span>
          ) : null}
          <span className={cx("truncate", isOverdue && "font-semibold")}>{label}</span>
          {entry.statusName !== null ? (
            <span
              data-testid="calendar-entry-status"
              className="mt-0.5 inline-flex max-w-full self-start truncate rounded bg-canvas/70 px-1 py-px text-[10px] font-medium text-fg-muted"
            >
              {entry.statusName}
            </span>
          ) : null}
        </span>
      )}
    </button>
  );
}
