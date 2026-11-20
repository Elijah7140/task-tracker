import { useRef, useState } from "react";
import { dialogStore } from "../state/dialog-store.js";

/**
 * Keeps a queued dialog mounted until its close animation ends, then settles it.
 * Base UI can then return focus to the element that was focused before it opened.
 */
export function useDialogLifecycle<Result extends boolean | string | null | undefined>(
  id: number,
  dismissResult: Result,
) {
  const [open, setOpen] = useState(true);
  const result = useRef<Result>(dismissResult);

  const close = (value: Result) => {
    result.current = value;
    setOpen(false);
  };
  const onOpenChange = (next: boolean) => {
    if (!next) {
      close(dismissResult);
    }
  };
  const onOpenChangeComplete = (next: boolean) => {
    if (!next) {
      dialogStore.getState().settle(id, result.current);
    }
  };

  return { open, close, onOpenChange, onOpenChangeComplete };
}
