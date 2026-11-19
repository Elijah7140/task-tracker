import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  firstDayOfWeek,
  formatMonthTitle,
  formatWeekTitle,
  monthRange,
  startOfWeek,
  weekRange,
} from "./calendar-dates.js";
import { MONTH_DAY_COUNT, WEEK_DAY_COUNT } from "./calendar-metrics.js";
import type { CalendarViewMode } from "./calendar-toolbar.js";

/**
 * The calendar's view and visible period (§7.4). It follows the server's
 * today until the user navigates. Month steps move from the first day of the
 * month, and opening Week asks the grid to scroll to the morning again.
 */
export function useCalendarPeriod(today: string, onChange: () => void) {
  const [mode, setMode] = useState<CalendarViewMode>("month");
  const [anchor, setAnchor] = useState(today);
  const [navigated, setNavigated] = useState(false);
  const [weekScrollTrigger, setWeekScrollTrigger] = useState(0);
  const weekStartsOn = useMemo(() => firstDayOfWeek(), []);

  useEffect(() => {
    if (!navigated) {
      setAnchor(today);
    }
  }, [navigated, today]);

  const moveTo = useCallback(
    (next: (current: string) => string) => {
      onChange();
      setNavigated(true);
      setAnchor(next);
    },
    [onChange],
  );

  const step = (direction: 1 | -1) => (current: string) =>
    mode === "month" ? addMonths(current, direction) : addDays(current, 7 * direction);

  const show = useCallback(
    (nextMode: CalendarViewMode) => {
      onChange();
      setMode(nextMode);
      if (nextMode === "week") {
        setWeekScrollTrigger((count) => count + 1);
      }
    },
    [onChange],
  );

  const range =
    mode === "month" ? monthRange(anchor, weekStartsOn) : weekRange(anchor, weekStartsOn);
  return {
    mode,
    anchor,
    range,
    dayCount: mode === "month" ? MONTH_DAY_COUNT : WEEK_DAY_COUNT,
    title:
      mode === "month"
        ? formatMonthTitle(anchor)
        : formatWeekTitle(startOfWeek(anchor, weekStartsOn)),
    weekStartsOn,
    weekScrollTrigger,
    previous: () => moveTo(step(-1)),
    next: () => moveTo(step(1)),
    goToday: () => moveTo(() => today),
    show,
    openDayInWeek: (isoDate: string) => {
      moveTo(() => isoDate);
      show("week");
    },
  };
}
