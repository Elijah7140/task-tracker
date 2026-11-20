import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useLocation } from "@tanstack/react-router";
import { Cause, Exit, Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import {
  applyHistoryAtom,
  HISTORY_KEY,
  HISTORY_REPLAY_KEY,
  historyStatusAtom,
} from "../rpc/history-queries.js";
import { dialogStore, notify } from "../state/dialog-store.js";
import { isItemEditorOpen } from "../state/item-editor-store.js";
import { markReturnPageStale, useReturnPageStore } from "../state/return-page-store.js";
import { findShortcut } from "../ui/keyboard-shortcut.js";

type Direction = "undo" | "redo";

function acceptsTextEditing(target: EventTarget | undefined) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.closest("textarea, [role=textbox]") !== null) {
    return true;
  }
  return (
    target instanceof HTMLInputElement &&
    !["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"].includes(
      target.type,
    )
  );
}

const HISTORY_SHORTCUTS = {
  undo: { key: "z", ctrl: true },
  redoWithShift: { key: "z", ctrl: true, shift: true },
  redo: { key: "y", ctrl: true },
} as const;

const SHORTCUT_DIRECTIONS: Readonly<Record<keyof typeof HISTORY_SHORTCUTS, Direction>> = {
  undo: "undo",
  redoWithShift: "redo",
  redo: "redo",
};

function shortcutDirection(event: KeyboardEvent): Direction | undefined {
  if (event.defaultPrevented || event.isComposing || acceptsTextEditing(event.composedPath()[0])) {
    return;
  }
  const shortcut = findShortcut(event, HISTORY_SHORTCUTS);
  return shortcut === undefined ? undefined : SHORTCUT_DIRECTIONS[shortcut];
}

function useHistoryKeys(apply: (direction: Direction) => Promise<void>) {
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const direction = shortcutDirection(event);
      if (direction !== undefined && !event.repeat && dialogStore.getState().queue.length === 0) {
        event.preventDefault();
        void latest.current(direction);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
}

interface Outcome {
  readonly revision: number;
  readonly page: string;
  readonly message: string;
}

/** Connects the shell's Edit commands, keyboard shortcuts and status to the session history. */
export function useHistoryActions(blockedReason: () => string | undefined) {
  const location = useLocation();
  const page = location.pathname;
  const covered = useReturnPageStore((state) => state.covering !== null);
  const inWorkspace = page.startsWith("/projects/") && !page.endsWith("/settings") && !covered;
  const query = useAtomValue(historyStatusAtom);
  const history = AsyncResult.isSuccess(query) ? query.value : undefined;
  const replay = useAtomSet(applyHistoryAtom, { mode: "promiseExit" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    setOutcome(null);
  }, [page, covered]);

  const showRefusal = (message: string) => {
    if (inWorkspace && !isItemEditorOpen()) {
      setOutcome({ page, message, revision: history?.revision ?? 0 });
    } else {
      void notify({ title: "Undo and redo", message });
    }
  };

  const apply = async (direction: Direction) => {
    if (
      running.current ||
      history?.[direction] == null ||
      dialogStore.getState().queue.length > 0
    ) {
      return;
    }
    const reason = blockedReason();
    if (reason !== undefined) {
      showRefusal(reason);
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      const exit = await replay({
        payload: { direction },
        reactivityKeys: [HISTORY_KEY, HISTORY_REPLAY_KEY],
      });
      if (Exit.isSuccess(exit)) {
        if (exit.value !== null) {
          markReturnPageStale();
        }
        if (exit.value !== null && inWorkspace) {
          const { label, revision } = exit.value;
          setOutcome({
            page,
            revision,
            message: `${direction === "undo" ? "Undid" : "Redid"}: ${label}`,
          });
        }
      } else {
        const error = Cause.findErrorOption(exit.cause);
        const message = describeRpcFailure(exit.cause);
        if (Option.isSome(error) && error.value._tag === "RuleViolation") {
          showRefusal(message);
        } else {
          void notify({ title: "Undo and redo failed", message });
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  useHistoryKeys(apply);
  const message =
    outcome?.page === page && (history?.revision ?? 0) <= outcome.revision ? outcome.message : null;
  return { undo: history?.undo ?? null, redo: history?.redo ?? null, busy, apply, message };
}
