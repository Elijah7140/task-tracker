import { useAtomSet } from "@effect/atom-react";
import type { CalendarReschedule, CalendarSnapshot } from "@task-tracker/contracts";
import { Cause, Exit, Option } from "effect";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeRescheduleCalendarEntryAtom } from "../rpc/calendar-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { markReturnPageStale, useReturnPageStore } from "../state/return-page-store.js";

type Request = typeof CalendarReschedule.Type;
type Snapshot = typeof CalendarSnapshot.Type | null;

interface FocusRequest {
  readonly itemId: string;
  readonly kind: Request["kind"];
  readonly date: string;
  readonly before: Snapshot;
  readonly view: string;
}

function sameEntry(left: Request, right: Request) {
  return left.itemId === right.itemId && left.kind === right.kind;
}

function merge(waiting: Request | null, next: Request): Request {
  if (waiting?.target.type !== "step" || next.target.type !== "step" || !sameEntry(waiting, next)) {
    return next;
  }
  return {
    ...next,
    target: {
      type: "step",
      days: waiting.target.days + next.target.days,
      quarters: waiting.target.quarters + next.target.quarters,
    },
  };
}

function restoreFocus(root: HTMLElement, request: FocusRequest, fromDate: string) {
  const { itemId, kind, date } = request;
  const entry = `[data-item-id="${itemId}"][data-entry-kind="${kind}"]`;
  const day = `[data-date="${date}"]`;
  const period = date < fromDate ? "previous" : "next";
  const target =
    root.querySelector<HTMLElement>(entry + day) ??
    root.querySelector<HTMLElement>(entry) ??
    root.querySelector<HTMLElement>(`[data-testid="calendar-more-button"]${day}`) ??
    root.querySelector<HTMLElement>(`[data-testid="calendar-${period}"]`);
  target?.focus();
  target?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

interface Options {
  readonly root: RefObject<HTMLDivElement | null>;
  readonly snapshot: Snapshot;
  readonly waitingForSnapshot: boolean;
  readonly view: string;
  readonly fromDate: string;
  readonly reload: () => void;
}

/** Serializes calendar writes, coalesces waiting gestures and restores keyboard focus after reload. */
export function useCalendarReschedule(options: Options) {
  const rescheduleAtom = useMemo(makeRescheduleCalendarEntryAtom, []);
  const save = useAtomSet(rescheduleAtom, { mode: "promiseExit" });
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const pending = useRef<Request | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const shown = useRef(true);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
      pending.current = null;
    };
  }, []);

  const { root, snapshot, waitingForSnapshot, view, fromDate } = options;
  useLayoutEffect(() => {
    if (focus === null) {
      return;
    }
    if (focus.view !== view) {
      setFocus(null);
    } else if (
      snapshot !== null &&
      snapshot !== focus.before &&
      !waitingForSnapshot &&
      root.current
    ) {
      restoreFocus(root.current, focus, fromDate);
      setFocus(null);
    }
  }, [focus, root, snapshot, waitingForSnapshot, view, fromDate]);

  const apply = async (request: Request) => {
    const { snapshot: before, view } = latest.current;
    const exit = await save(request);
    if (!shown.current) {
      return;
    }
    if (Exit.isFailure(exit)) {
      pending.current = null;
      setFocus(null);
      const failure = Cause.findErrorOption(exit.cause);
      if (
        Option.isSome(failure) &&
        (failure.value._tag === "RuleViolation" || failure.value._tag === "NotFound")
      ) {
        latest.current.reload();
      }
      setError(describeRpcFailure(exit.cause));
      return;
    }
    if (exit.value === null) {
      return;
    }
    markReturnPageStale();
    const { date } = exit.value;
    if (request.target.type === "step") {
      setFocus({ itemId: request.itemId, kind: request.kind, date, before, view });
    }
  };

  const drain = async () => {
    useReturnPageStore.getState().setBusy(true);
    try {
      while (shown.current && pending.current !== null) {
        const request = pending.current;
        pending.current = null;
        await apply(request);
      }
    } finally {
      running.current = null;
      if (shown.current) {
        useReturnPageStore.getState().setBusy(false);
      }
    }
  };

  const move = (request: Request) => {
    pending.current = merge(pending.current, request);
    setError(null);
    running.current ??= drain();
  };

  /**
   * Runs another write that moves an entry, such as a push back (§7.14), and
   * then focuses the entry on `date` once Calendar has reloaded.
   */
  const follow = async (
    entry: Pick<FocusRequest, "itemId" | "kind" | "date">,
    write: () => Promise<boolean>,
  ) => {
    const { snapshot: before, view } = latest.current;
    if ((await write()) && shown.current) {
      setFocus({ ...entry, before, view });
    }
  };

  return {
    move,
    follow,
    error,
    clearError: () => setError(null),
    /** Lets a return request wait for committed dates and workspace invalidation. */
    afterMoves: async (back: () => void) => {
      await running.current;
      if (shown.current) {
        back();
      }
    },
  };
}
