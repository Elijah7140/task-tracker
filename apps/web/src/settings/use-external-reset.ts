import { useEffect, useRef } from "react";

/**
 * Calls `reset` when the server sends a new `incoming` value that differs
 * from both the previous one and what this form last saved. A refresh caused
 * by this form's own save, or one that changes nothing, keeps the draft.
 */
export function useExternalReset<Value>(
  incoming: Value,
  saved: Value,
  same: (left: Value, right: Value) => boolean,
  reset: () => void,
) {
  const previousRef = useRef(incoming);

  useEffect(() => {
    if (same(previousRef.current, incoming)) {
      return;
    }
    previousRef.current = incoming;
    if (!same(saved, incoming)) {
      reset();
    }
  }, [incoming, saved, same, reset]);
}
