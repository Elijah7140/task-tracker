import type { CompletionResult } from "@task-tracker/contracts";
import { create } from "zustand";

/** A short message shown after an action, such as the end of a repeat (§7.11). */
export interface StatusNotice {
  readonly id: number;
  readonly message: string;
}

/** The app's current status notice, if any. */
export const useStatusNoticeStore = create<{ readonly notice: StatusNotice | null }>()(() => ({
  notice: null,
}));

let sequence = 0;

/** Shows `message` in the status notice, replacing any earlier one. */
export function showStatusNotice(message: string) {
  sequence += 1;
  useStatusNoticeStore.setState({ notice: { id: sequence, message } });
}

/** Hides the status notice. */
export function dismissStatusNotice() {
  useStatusNoticeStore.setState({ notice: null });
}

/** Shown when a completed occurrence's rule has no next date (§7.11). */
export const LAST_REPEAT_MESSAGE = "That was the last repeat.";

/**
 * Reports what a completion did besides completing: a Done status kept off by a
 * new sub-item occurrence, or the end of a repeat.
 */
export function noticeCompletion(result: typeof CompletionResult.Type) {
  if (result.kind !== "applied") {
    return;
  }
  const messages = [
    result.parentKeptOpenMessage,
    result.lastRepeat === true ? LAST_REPEAT_MESSAGE : undefined,
  ].filter((message) => message !== undefined);
  if (messages.length > 0) {
    showStatusNotice(messages.join(" "));
  }
}
