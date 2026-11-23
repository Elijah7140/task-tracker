import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { CircleAlert } from "lucide-react";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import type { CalendarEntry } from "@task-tracker/contracts";
import { CALENDAR_KEY, calendarSnapshotAtom } from "../rpc/calendar-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { serverInfoAtom } from "../rpc/server-info-query.js";
import { rendererClockAtom, urgencyRefreshAtom } from "../rpc/urgency-refresh.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { dialogStore } from "../state/dialog-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { matchesShortcut } from "../ui/keyboard-shortcut.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PUSH_BACK_SHORTCUT, pushBackReason } from "../workspace/push-back-availability.js";
import { usePushBackOneDay } from "../workspace/use-push-back-one-day.js";
import { addDays, weekdayHeaders } from "./calendar-dates.js";
import { clockDate } from "./clock-date.js";
import { CalendarEntryMenuContext, type CalendarEntryMenuActions } from "./calendar-entry-menu.js";
import { buildCalendarDays, type CalendarDay } from "./calendar-layout.js";
import { calendarStep } from "./calendar-move-keys.js";
import { CalendarMonthGrid } from "./calendar-month-grid.js";
import { type CalendarScope, CalendarToolbar } from "./calendar-toolbar.js";
import { CalendarWeekGrid } from "./calendar-week-grid.js";
import { useCalendarActivation } from "./use-calendar-activation.js";
import { useCalendarDrag } from "./use-calendar-drag.js";
import { useCalendarEntryActions } from "./use-calendar-entry-actions.js";
import { useCalendarFocus } from "./use-calendar-focus.js";
import { useCalendarKeys } from "./use-calendar-keys.js";
import { useCalendarReschedule } from "./use-calendar-reschedule.js";
import { usePriorityRanks } from "./use-priority-ranks.js";
import { useCalendarPeriod } from "./use-calendar-period.js";

/** A stable empty list while the first snapshot loads, so the day layout is not rebuilt. */
const NO_ENTRIES: ReadonlyArray<typeof CalendarEntry.Type> = [];

/** Props for {@link CalendarPage}. */
export interface CalendarPageProps {
  readonly onBack: () => void;
  readonly runGuards: ReturnGuard;
}

/** Today in the server's zone from the renderer's Effect Clock, until the server answers. */
function useClockDate(timeZone: string): string {
  const clock = useAtomValue(rendererClockAtom);
  return useMemo(() => clockDate(clock, timeZone), [clock, timeZone]);
}

/** The scoped calendar query for the visible range, refreshed each minute. */
function useCalendarSnapshot(params: Parameters<typeof calendarSnapshotAtom>[0]) {
  const { projectId, fromDate, toDateExclusive, includeCompleted } = params;
  const queryAtom = useMemo(
    () => calendarSnapshotAtom({ projectId, fromDate, toDateExclusive, includeCompleted }),
    [projectId, fromDate, toDateExclusive, includeCompleted],
  );
  const result = useAtomValue(queryAtom);
  const reload = useAtomRefresh(queryAtom);
  useAtomMount(urgencyRefreshAtom(CALENDAR_KEY));
  return { result, reload };
}

function CalendarError({ message }: { readonly message: string }) {
  return (
    <p
      role="alert"
      data-testid="calendar-error"
      className="flex shrink-0 items-start gap-2 rounded-card border border-line bg-danger-soft px-4 py-2.5 text-[13px] text-danger"
    >
      <CircleAlert size={15} aria-hidden="true" className="mt-px shrink-0" />
      {message}
    </p>
  );
}

function entryAt(target: EventTarget, days: ReadonlyArray<CalendarDay>) {
  const button =
    target instanceof Element
      ? target.closest<HTMLElement>('[data-testid="calendar-entry"]')
      : null;
  if (button === null) {
    return;
  }
  const { date, itemId } = button.dataset;
  const occurrence = days
    .find((day) => day.date === date)
    ?.entries.find(({ entry }) => entry.itemId === itemId);
  return occurrence === undefined ? undefined : { button, occurrence };
}

/**
 * A key the page itself should handle: not already handled, no dialog open, and
 * pressed inside the page rather than in a portaled entry menu.
 */
function isPageKey(event: KeyboardEvent, page: HTMLElement | null) {
  const insidePage = event.target instanceof Node && page?.contains(event.target) === true;
  return insidePage && !event.defaultPrevented && dialogStore.getState().queue.length === 0;
}

/** Ctrl+Shift+P on a focused entry pushes back its item, ignoring a held key's repeats (§7.14). */
function pushBackKey(
  event: KeyboardEvent,
  days: ReadonlyArray<CalendarDay>,
  pushBack: CalendarEntryMenuActions["pushBack"],
): boolean {
  const occurrence = matchesShortcut(event, PUSH_BACK_SHORTCUT)
    ? entryAt(event.target, days)?.occurrence
    : undefined;
  if (occurrence === undefined) {
    return false;
  }
  const { entry, day } = occurrence;
  if (
    !event.repeat &&
    pushBackReason({ isCompleted: entry.isCompleted, hasDates: true }) === null
  ) {
    pushBack(entry, day);
  }
  return true;
}

/** Push back one day for an entry, focusing the moved entry on its new day afterwards. */
function useEntryPushBack(
  follow: ReturnType<typeof useCalendarReschedule>["follow"],
  clearErrors: () => void,
): CalendarEntryMenuActions["pushBack"] {
  const pushBackItem = usePushBackOneDay();
  return (entry, day) => {
    clearErrors();
    const { itemId, projectId, folderId } = entry;
    void follow({ itemId, date: addDays(day, 1) }, () =>
      pushBackItem({ id: itemId, projectId, folderId }),
    );
  };
}

function isEscape(event: KeyboardEvent) {
  return (
    event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
  );
}

/**
 * Month and week calendar covering page (§7.4). Displays due dates with
 * server-computed urgency refreshed every minute, scope and
 * completion filters, keyboard period and view shortcuts, and guarded item opening.
 */
export function CalendarPage({ onBack, runGuards }: CalendarPageProps) {
  const serverInfo = useAtomValue(serverInfoAtom);
  const timeZone = AsyncResult.isSuccess(serverInfo) ? serverInfo.value.timeZone : "UTC";
  const clockToday = useClockDate(timeZone);
  const originProjectId = useReturnPageStore((state) => state.originProjectId);
  const [scope, setScope] = useState<CalendarScope>(originProjectId === null ? "all" : "project");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loadedToday, setLoadedToday] = useState<string | null>(null);
  const today = loadedToday ?? clockToday;
  // Period changes clear an activation error; the activation hook needs the reload first.
  const clearError = useRef(() => {});
  const period = useCalendarPeriod(today, () => clearError.current());
  const { result, reload } = useCalendarSnapshot({
    projectId: scope === "project" ? originProjectId : null,
    ...period.range,
    includeCompleted,
  });
  const activation = useCalendarActivation({ runGuards, reload });
  const snapshot = AsyncResult.isSuccess(result) ? result.value : null;
  if (snapshot !== null && snapshot.today !== loadedToday) {
    setLoadedToday(snapshot.today);
  }

  const entries = snapshot?.entries ?? NO_ENTRIES;
  const priorityRanks = usePriorityRanks();
  const days = useMemo(
    () =>
      buildCalendarDays(
        period.range.fromDate,
        period.dayCount,
        period.anchor,
        today,
        entries,
        priorityRanks,
      ),
    [period.range.fromDate, period.dayCount, period.anchor, today, entries, priorityRanks],
  );
  const dates = useMemo(() => days.map((day) => day.date), [days]);
  const root = useRef<HTMLDivElement>(null);
  const requestFocus = useCalendarFocus(root, result, dates);
  const reschedule = useCalendarReschedule({
    root,
    snapshot,
    waitingForSnapshot: result.waiting,
    view: JSON.stringify([period.mode, period.range.fromDate, scope, includeCompleted]),
    fromDate: period.range.fromDate,
    reload,
  });
  const drag = useCalendarDrag((request) => {
    activation.clearError();
    reschedule.move(request);
  });
  clearError.current = () => {
    activation.clearError();
    reschedule.clearError();
  };
  const pushBack = useEntryPushBack(reschedule.follow, () => clearError.current());
  const entryActions = useCalendarEntryActions(pushBack);

  useCalendarKeys({
    previous: () => {
      period.previous();
      requestFocus({ kind: "period", fallbackTestId: "calendar-previous" });
    },
    next: () => {
      period.next();
      requestFocus({ kind: "period", fallbackTestId: "calendar-next" });
    },
    showMonth: () => period.show("month"),
    showWeek: () => period.show("week"),
  });

  const goBack = () => void reschedule.afterMoves(onBack);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isPageKey(event, root.current)) {
      return;
    }
    if (isEscape(event) && useReturnPageStore.getState().busy) {
      event.preventDefault();
      goBack();
      return;
    }
    if (pushBackKey(event, days, entryActions.pushBack)) {
      event.preventDefault();
      return;
    }
    const step = calendarStep(event);
    const occurrence = step === undefined ? undefined : entryAt(event.target, days)?.occurrence;
    if (step === undefined || occurrence === undefined) {
      return;
    }
    event.preventDefault();
    if (!occurrence.isAllDay || step.quarters === 0) {
      activation.clearError();
      reschedule.move({ itemId: occurrence.entry.itemId, target: step });
    }
  };
  const weekdays = useMemo(() => weekdayHeaders(period.weekStartsOn), [period.weekStartsOn]);
  const onActivate = (occurrence: Parameters<typeof activation.activate>[0]) => {
    if (!useReturnPageStore.getState().busy) {
      reschedule.clearError();
      void activation.activate(occurrence);
    }
  };
  const openDayInWeek = (date: string) => {
    period.openDayInWeek(date);
    requestFocus({ kind: "day", date });
  };
  const error = reschedule.error ?? activation.error;

  return (
    <div
      ref={root}
      data-testid="calendar-page"
      data-dragging={drag.dragging || undefined}
      onScrollCapture={drag.refresh}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        const source = entryAt(event.target, days);
        if (source !== undefined) {
          drag.press(event, source.button, source.occurrence);
        }
      }}
      className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-3 px-6 py-5 data-dragging:cursor-grabbing"
    >
      <CalendarToolbar
        title={period.title}
        mode={period.mode}
        scope={originProjectId === null ? null : scope}
        includeCompleted={includeCompleted}
        onBack={goBack}
        onPrevious={period.previous}
        onToday={period.goToday}
        onNext={period.next}
        onModeChange={period.show}
        onScopeChange={(nextScope) => {
          clearError.current();
          setScope(nextScope);
        }}
        onIncludeCompletedChange={(checked) => {
          clearError.current();
          setIncludeCompleted(checked);
        }}
      />
      {error === null ? null : <CalendarError message={error} />}
      <CalendarEntryMenuContext.Provider value={entryActions}>
        {AsyncResult.isFailure(result) ? (
          <LoadFailure
            message={describeRpcFailure(result.cause)}
            onRetry={reload}
            testId="calendar-load-failure"
          />
        ) : period.mode === "month" ? (
          <CalendarMonthGrid
            weekdays={weekdays}
            days={days}
            feedback={drag.feedback}
            onActivate={onActivate}
            onOpenDayInWeek={openDayInWeek}
          />
        ) : (
          <CalendarWeekGrid
            days={days}
            feedback={drag.feedback}
            scrollTrigger={period.weekScrollTrigger}
            onActivate={onActivate}
          />
        )}
      </CalendarEntryMenuContext.Provider>
    </div>
  );
}
