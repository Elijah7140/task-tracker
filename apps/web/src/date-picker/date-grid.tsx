import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  firstDayOfWeek,
  formatDayName,
  formatMonthTitle,
  parseIsoDate,
  weekdayHeaders,
} from "../calendar/calendar-dates.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { isInMonth, pickerKeyTarget, pickerMonthDays, shiftMonths } from "./date-picker-month.js";

/** Props for {@link DateGrid}. */
export interface DateGridProps {
  /** The selected `YYYY-MM-DD` date, or `""` when none is set. */
  readonly value: string;
  /** Today's `YYYY-MM-DD` date in the server's zone. */
  readonly today: string;
  readonly onSelect: (date: string) => void;
  /** Receives the day button that holds focus, so the popover can focus it on open. */
  readonly focusRef: RefObject<HTMLButtonElement | null>;
  readonly locale?: string | undefined;
}

const DAYS_PER_WEEK = 7;

/**
 * A month of days for choosing one date. The selected day is filled with the
 * accent and today has an accent outline, so both read at a glance in either
 * theme. Opens on the selected day's month, or today's when nothing is set.
 * Arrows, PageUp and PageDown, Home and End move focus; Enter or Space selects.
 */
export function DateGrid({ value, today, onSelect, focusRef, locale }: DateGridProps) {
  const [focused, setFocused] = useState(value === "" ? today : value);
  const moveFocus = useRef(false);
  const titleId = useId();
  const weekStartsOn = useMemo(() => firstDayOfWeek(locale), [locale]);
  const days = useMemo(() => pickerMonthDays(focused, weekStartsOn), [focused, weekStartsOn]);

  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      focusRef.current?.focus();
    }
  }, [focused, focusRef]);

  const focusDay = (date: string) => {
    moveFocus.current = true;
    setFocused(date);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onSelect(focused);
      return;
    }
    const target = pickerKeyTarget(event, focused, weekStartsOn);
    if (target !== null) {
      event.preventDefault();
      event.stopPropagation();
      focusDay(target);
    }
  };

  return (
    <div className="flex w-[15.5rem] flex-col gap-2" data-testid="date-picker">
      <MonthHeader
        month={focused}
        titleId={titleId}
        locale={locale}
        onStep={(months) => setFocused(shiftMonths(focused, months))}
      />
      <div
        role="grid"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        data-testid="date-picker-grid"
        className="flex flex-col gap-0.5"
      >
        <WeekdayRow weekStartsOn={weekStartsOn} locale={locale} />
        {weeksOf(days).map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7 justify-items-center">
            {week.map((date) => (
              <DayCell
                key={date}
                date={date}
                month={focused}
                selected={date === value}
                isToday={date === today}
                focused={date === focused}
                focusRef={focusRef}
                locale={locale}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-line pt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSelect(today)}
          data-testid="date-picker-today"
        >
          Today
        </Button>
      </div>
    </div>
  );
}

function weeksOf(days: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<string>> {
  return Array.from({ length: days.length / DAYS_PER_WEEK }, (_, week) =>
    days.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
}

interface MonthHeaderProps {
  readonly month: string;
  readonly titleId: string;
  readonly locale: string | undefined;
  readonly onStep: (months: number) => void;
}

function MonthHeader({ month, titleId, locale, onStep }: MonthHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous month"
        onClick={() => onStep(-1)}
        data-testid="date-picker-previous"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Button>
      <span
        id={titleId}
        aria-live="polite"
        data-testid="date-picker-month"
        className="text-[13px] font-semibold text-fg"
      >
        {formatMonthTitle(month, locale)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next month"
        onClick={() => onStep(1)}
        data-testid="date-picker-next"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

function WeekdayRow({
  weekStartsOn,
  locale,
}: {
  readonly weekStartsOn: number;
  readonly locale: string | undefined;
}) {
  const headers = useMemo(() => weekdayHeaders(weekStartsOn, locale), [weekStartsOn, locale]);
  return (
    <div role="row" className="grid grid-cols-7 justify-items-center">
      {headers.map((header) => (
        <span
          key={header}
          role="columnheader"
          className="flex h-6 items-center text-[11px] font-medium text-fg-subtle"
        >
          {header}
        </span>
      ))}
    </div>
  );
}

interface DayCellProps {
  readonly date: string;
  readonly month: string;
  readonly selected: boolean;
  readonly isToday: boolean;
  readonly focused: boolean;
  readonly focusRef: RefObject<HTMLButtonElement | null>;
  readonly locale: string | undefined;
  readonly onSelect: (date: string) => void;
}

function dayClassName({ date, month, selected, isToday }: DayCellProps) {
  return cx(
    "flex size-8 cursor-default items-center justify-center rounded-full border text-[13px] tabular-nums outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-focus",
    selected
      ? "border-accent bg-accent font-semibold text-on-accent hover:bg-accent-hover"
      : "hover:bg-hover",
    !selected && isToday && "border-accent font-semibold text-accent-text",
    !selected && !isToday && "border-transparent",
    !selected && !isToday && (isInMonth(date, month) ? "text-fg" : "text-fg-subtle"),
    selected && isToday && "inset-ring-2 inset-ring-raised",
  );
}

function DayCell(props: DayCellProps) {
  const { date, selected, isToday, focused, focusRef, locale, onSelect } = props;
  return (
    <div role="gridcell" aria-selected={selected}>
      <button
        type="button"
        ref={focused ? focusRef : undefined}
        tabIndex={focused ? 0 : -1}
        aria-label={formatDayName(date, locale)}
        aria-current={isToday ? "date" : undefined}
        data-date={date}
        data-selected={selected ? "true" : undefined}
        data-today={isToday ? "true" : undefined}
        data-testid="date-picker-day"
        onClick={() => onSelect(date)}
        className={dayClassName(props)}
      >
        {parseIsoDate(date).day}
      </button>
    </div>
  );
}
