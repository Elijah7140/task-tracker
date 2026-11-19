import { formatDayName } from "./calendar-dates.js";
import { CalendarEntryButton } from "./calendar-entry-button.js";
import { calendarNavProps, handleCalendarGridKey } from "./calendar-grid-keys.js";
import type { CalendarDay, CalendarOccurrence } from "./calendar-layout.js";
import type { CalendarDragFeedback } from "./use-calendar-drag.js";
import { cx } from "../ui/class-names.js";

/** Props for {@link CalendarMonthGrid}. */
export interface CalendarMonthGridProps {
  readonly feedback: CalendarDragFeedback | null;
  readonly weekdays: ReadonlyArray<string>;
  readonly days: ReadonlyArray<CalendarDay>;
  readonly onActivate: (occurrence: CalendarOccurrence) => void;
  readonly onOpenDayInWeek: (isoDate: string) => void;
}

/**
 * Six-week month grid starting on the locale's first day of week (§7.4).
 * Days outside the selected month are dimmed; cells show up to three entries
 * followed by "+N more" which opens that day in Week view. Arrow keys move
 * between entries (see {@link handleCalendarGridKey}).
 */
export function CalendarMonthGrid({
  feedback,
  weekdays,
  days,
  onActivate,
  onOpenDayInWeek,
}: CalendarMonthGridProps) {
  return (
    <div
      data-testid="calendar-month-grid"
      onKeyDown={(event) =>
        handleCalendarGridKey(
          event,
          days.map((day) => day.date),
        )
      }
      className="flex min-h-0 flex-1 flex-col overflow-x-auto rounded-card border border-line bg-canvas"
    >
      <div className="flex min-w-[630px] flex-1 flex-col">
        <div className="grid grid-cols-7 border-b border-line bg-sidebar/60">
          {weekdays.map((weekday) => (
            <div key={weekday} className="px-2 py-1.5 text-xs font-medium text-fg-muted">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 grid-rows-6 divide-x divide-y divide-line">
          {days.map((day) => (
            <div
              key={day.date}
              role="group"
              aria-label={day.accessibleName}
              data-testid="calendar-month-cell"
              data-date={day.date}
              data-calendar-drop-zone="month"
              data-drop-active={
                (feedback?.target.type === "month" && feedback.target.date === day.date) ||
                undefined
              }
              data-today={day.isToday ? "true" : undefined}
              data-outside-month={day.isOutsideMonth ? "true" : undefined}
              className={cx(
                "flex min-h-[104px] min-w-0 flex-col gap-1 p-1.5 data-drop-active:ring-2 data-drop-active:ring-inset data-drop-active:ring-focus",
                day.isOutsideMonth && "bg-sidebar/40 opacity-55",
                day.isToday && "bg-accent-soft/45",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cx(
                    "inline-flex min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium",
                    day.isToday ? "bg-accent text-on-accent" : "text-fg-muted",
                  )}
                >
                  {day.dayNumber}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                {day.visibleMonthEntries.map((occurrence, index) => (
                  <CalendarEntryButton
                    key={`${occurrence.entry.itemId}-${occurrence.entry.kind}`}
                    occurrence={occurrence}
                    variant="inline"
                    navIndex={index}
                    onActivate={onActivate}
                  />
                ))}
                {day.moreCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenDayInWeek(day.date)}
                    {...calendarNavProps(day.date, day.visibleMonthEntries.length)}
                    data-testid="calendar-more-button"
                    aria-label={`+${day.moreCount} more on ${formatDayName(day.date)}`}
                    className="self-start rounded px-1 py-0.5 text-xs font-medium text-accent-text hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    +{day.moreCount} more
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
