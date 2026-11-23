import { useLayoutEffect, useRef } from "react";
import { CalendarDropGhost } from "./calendar-drop-ghost.js";
import { CalendarEntryButton } from "./calendar-entry-button.js";
import { handleCalendarGridKey } from "./calendar-grid-keys.js";
import type { CalendarDay, CalendarOccurrence } from "./calendar-layout.js";
import { DAY_HEIGHT, HOUR_HEIGHT, HOUR_LABELS, MORNING_OFFSET } from "./calendar-metrics.js";
import type { CalendarDragFeedback } from "./use-calendar-drag.js";
import { cx } from "../ui/class-names.js";

/** Props for {@link CalendarWeekGrid}. */
export interface CalendarWeekGridProps {
  readonly feedback: CalendarDragFeedback | null;
  readonly days: ReadonlyArray<CalendarDay>;
  /** Incremented whenever the view opens or switches to Week so it scrolls to 07:00. */
  readonly scrollTrigger: number;
  readonly onActivate: (occurrence: CalendarOccurrence) => void;
}

/**
 * Seven-column week view with an expandable all-day row and a 00:00–24:00 time
 * grid at 48 pixels per hour, scrolled to 07:00 when opened (§7.4).
 */
export function CalendarWeekGrid({
  days,
  scrollTrigger,
  onActivate,
  feedback,
}: CalendarWeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container !== null) {
      container.scrollTop = MORNING_OFFSET;
    }
  }, [scrollTrigger]);

  return (
    <div
      data-testid="calendar-week-grid"
      onKeyDown={(event) =>
        handleCalendarGridKey(
          event,
          days.map((day) => day.date),
        )
      }
      className="flex min-h-0 flex-1 flex-col overflow-x-auto rounded-card border border-line bg-canvas"
    >
      <div className="flex min-h-0 min-w-[680px] flex-1 flex-col">
        <div className="flex shrink-0 border-b border-line bg-sidebar/60">
          <div className="w-12 shrink-0 border-r border-line" />
          <div className="grid flex-1 grid-cols-7 divide-x divide-line">
            {days.map((day) => (
              <div
                key={day.date}
                data-testid="calendar-week-day-header"
                data-date={day.date}
                data-today={day.isToday ? "true" : undefined}
                className={cx(
                  "px-2 py-2 text-xs font-medium",
                  day.isToday
                    ? "bg-accent-soft/60 font-semibold text-accent-text"
                    : "text-fg-muted",
                )}
              >
                {day.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 border-b border-line bg-canvas">
          <div className="flex w-12 shrink-0 items-start justify-end border-r border-line px-1.5 py-1.5 text-[11px] text-fg-subtle">
            All day
          </div>
          <div className="grid flex-1 grid-cols-7 divide-x divide-line">
            {days.map((day) => (
              <div
                key={day.date}
                role="group"
                aria-label={`${day.accessibleName}, all day`}
                data-testid="calendar-allday-cell"
                data-calendar-drop-zone="all-day"
                data-drop-active={
                  (feedback?.target.type === "all-day" && feedback.target.date === day.date) ||
                  undefined
                }
                data-date={day.date}
                className={cx(
                  "flex min-h-8 min-w-0 flex-col gap-1 p-1 data-drop-active:ring-2 data-drop-active:ring-inset data-drop-active:ring-focus",
                  day.isToday && "bg-accent-soft/35",
                )}
              >
                {day.allDayEntries.map((occurrence, index) => (
                  <CalendarEntryButton
                    key={occurrence.entry.itemId}
                    occurrence={occurrence}
                    variant="inline"
                    navIndex={index}
                    onActivate={onActivate}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          data-testid="calendar-week-scroll"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="flex" style={{ height: `${DAY_HEIGHT}px` }}>
            <div className="w-12 shrink-0 border-r border-line bg-sidebar/30">
              {HOUR_LABELS.map((label) => (
                <div
                  key={label}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="px-1.5 pt-0.5 text-right text-[11px] tabular-nums text-fg-subtle"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-7 divide-x divide-line">
              {days.map((day) => (
                <div
                  key={day.date}
                  role="group"
                  aria-label={day.accessibleName}
                  data-testid="calendar-time-column"
                  data-calendar-drop-zone="time"
                  data-date={day.date}
                  data-today={day.isToday ? "true" : undefined}
                  style={{ height: `${DAY_HEIGHT}px` }}
                  className={cx(
                    "relative min-w-0 overflow-hidden",
                    day.isToday && "bg-accent-soft/30",
                  )}
                >
                  {HOUR_LABELS.map((label, hour) => (
                    <div
                      key={label}
                      aria-hidden="true"
                      style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                      className="pointer-events-none absolute inset-x-0 border-b border-line/70"
                    />
                  ))}
                  {feedback?.target.type === "time" && feedback.target.date === day.date ? (
                    <CalendarDropGhost feedback={feedback} />
                  ) : null}
                  {day.timedEntries.map((occurrence, index) => (
                    <CalendarEntryButton
                      key={occurrence.entry.itemId}
                      occurrence={occurrence}
                      variant="block"
                      navIndex={day.allDayEntries.length + index}
                      onActivate={onActivate}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
