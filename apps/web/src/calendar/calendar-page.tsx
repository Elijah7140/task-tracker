import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { Clock, Effect } from "effect";
import { AsyncResult } from "effect/reactivity";
import { CircleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CALENDAR_KEY, calendarSnapshotAtom } from "../rpc/calendar-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { serverInfoAtom } from "../rpc/server-info-query.js";
import { rendererClockAtom, urgencyRefreshAtom } from "../rpc/urgency-refresh.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { LoadFailure } from "../ui/load-failure.js";
import { formatIsoDateInZone, weekdayHeaders } from "./calendar-dates.js";
import { buildCalendarDays } from "./calendar-layout.js";
import { CalendarMonthGrid } from "./calendar-month-grid.js";
import { type CalendarScope, CalendarToolbar } from "./calendar-toolbar.js";
import { CalendarWeekGrid } from "./calendar-week-grid.js";
import { useCalendarActivation } from "./use-calendar-activation.js";
import { useCalendarKeys } from "./use-calendar-keys.js";
import { useCalendarPeriod } from "./use-calendar-period.js";

/** Props for {@link CalendarPage}. */
export interface CalendarPageProps {
  readonly onBack: () => void;
  readonly runGuards: ReturnGuard;
}

/** Today in the server's zone from the renderer's Effect Clock, until the server answers. */
function useClockDate(timeZone: string): string {
  const clock = useAtomValue(rendererClockAtom);
  return useMemo(() => {
    const now = Clock.currentTimeMillis;
    const millis = Effect.runSync(
      clock === undefined ? now : now.pipe(Effect.provideService(Clock.Clock, clock)),
    );
    return formatIsoDateInZone(millis, timeZone);
  }, [clock, timeZone]);
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

/**
 * Month and week calendar covering page (§7.4). Displays due dates and scheduled
 * blocks with server-computed urgency refreshed every minute, scope and
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
  clearError.current = activation.clearError;
  const snapshot = AsyncResult.isSuccess(result) ? result.value : null;
  if (snapshot !== null && snapshot.today !== loadedToday) {
    setLoadedToday(snapshot.today);
  }

  useCalendarKeys({
    previous: period.previous,
    next: period.next,
    showMonth: () => period.show("month"),
    showWeek: () => period.show("week"),
  });

  const entries = snapshot?.entries ?? [];
  const days = useMemo(
    () => buildCalendarDays(period.range.fromDate, period.dayCount, period.anchor, today, entries),
    [period.range.fromDate, period.dayCount, period.anchor, today, entries],
  );
  const weekdays = useMemo(() => weekdayHeaders(period.weekStartsOn), [period.weekStartsOn]);
  const onActivate = (occurrence: Parameters<typeof activation.activate>[0]) =>
    void activation.activate(occurrence);

  return (
    <div
      data-testid="calendar-page"
      className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-3 px-6 py-5"
    >
      <CalendarToolbar
        title={period.title}
        mode={period.mode}
        scope={originProjectId === null ? null : scope}
        includeCompleted={includeCompleted}
        onBack={onBack}
        onPrevious={period.previous}
        onToday={period.goToday}
        onNext={period.next}
        onModeChange={period.show}
        onScopeChange={(nextScope) => {
          activation.clearError();
          setScope(nextScope);
        }}
        onIncludeCompletedChange={(checked) => {
          activation.clearError();
          setIncludeCompleted(checked);
        }}
      />
      {activation.error === null ? null : <CalendarError message={activation.error} />}
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
          onActivate={onActivate}
          onOpenDayInWeek={period.openDayInWeek}
        />
      ) : (
        <CalendarWeekGrid
          days={days}
          scrollTrigger={period.weekScrollTrigger}
          onActivate={onActivate}
        />
      )}
    </div>
  );
}
