import type { ReminderEntry } from "@task-tracker/contracts";
import { X } from "lucide-react";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { Button } from "../ui/button.js";
import { ReminderRow, type ReminderRowActions } from "./reminder-row.js";

type Entry = typeof ReminderEntry.Type;

/** Props for {@link RemindersPanel}. */
export interface RemindersPanelProps extends ReminderRowActions {
  readonly reminders: ReadonlyArray<Entry>;
  readonly failure: string | null;
  readonly onRetry: () => void;
  readonly onClose: () => void;
  readonly closeRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Keeps focus in the panel when a row the user acted on leaves: on the next
 * row's first action, else the previous row's, else the close button. Focus
 * that has moved elsewhere, such as into a message box, stays where it is.
 */
function useRowFocusRecovery(
  panel: RefObject<HTMLDivElement | null>,
  reminders: ReadonlyArray<Entry>,
  closeRef: RefObject<HTMLButtonElement | null>,
) {
  const acted = useRef<{ itemId: string; index: number } | null>(null);
  const track = (entry: Entry) => {
    const index = reminders.findIndex((candidate) => candidate.itemId === entry.itemId);
    acted.current = { itemId: entry.itemId, index };
  };
  useLayoutEffect(() => {
    const last = acted.current;
    if (last === null || reminders.some((entry) => entry.itemId === last.itemId)) {
      return;
    }
    acted.current = null;
    const focus = document.activeElement;
    const lost = focus === null || focus === document.body || !focus.isConnected;
    if (!lost && !panel.current?.contains(focus)) {
      return;
    }
    const next = reminders[Math.min(last.index, reminders.length - 1)];
    const target =
      next === undefined
        ? closeRef.current
        : panel.current?.querySelector<HTMLElement>(`[data-reminder-item="${next.itemId}"] button`);
    target?.focus();
  }, [reminders, panel, closeRef]);
  return track;
}

/** The in-app Reminders panel: delivered reminders newest first, with their actions (§7.12). */
export function RemindersPanel({
  reminders,
  failure,
  onRetry,
  onClose,
  closeRef,
  ...actions
}: RemindersPanelProps) {
  const container = useRef<HTMLDivElement>(null);
  const track = useRowFocusRecovery(container, reminders, closeRef);
  const tracked =
    <Args extends unknown[]>(action: (entry: Entry, ...args: Args) => void) =>
    (entry: Entry, ...args: Args) => {
      track(entry);
      action(entry, ...args);
    };
  return (
    <div
      ref={container}
      className="flex max-h-[min(28rem,calc(100vh-6rem))] w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Reminders</h2>
        <Button
          ref={closeRef}
          variant="ghost"
          size="icon"
          aria-label="Close reminders"
          onClick={onClose}
          data-testid="reminders-close"
        >
          <X size={15} aria-hidden="true" />
        </Button>
      </div>
      {failure === null ? null : (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 text-[13px] text-danger"
        >
          <span>{failure}</span>
          <Button size="sm" onClick={onRetry} data-testid="reminders-retry">
            Try again
          </Button>
        </div>
      )}
      {reminders.length === 0 ? (
        <p data-testid="reminders-empty" className="text-[13px] text-fg-muted">
          No reminders
        </p>
      ) : (
        <ul aria-label="Delivered reminders" className="-mr-2 overflow-y-auto pr-2">
          {reminders.map((entry) => (
            <ReminderRow
              key={entry.itemId}
              entry={entry}
              onOpen={actions.onOpen}
              onComplete={tracked(actions.onComplete)}
              onSnooze={tracked(actions.onSnooze)}
              onDismiss={tracked(actions.onDismiss)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
