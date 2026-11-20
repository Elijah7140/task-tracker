import { type RefObject, useEffect, useRef } from "react";

/**
 * Focuses the element once when it mounts, as a covering page focuses its
 * heading so keys reach it and focus does not stay on the page it covers.
 */
export function useFocusOnMount(ref: RefObject<HTMLElement | null>, enabled = true) {
  const focusOnMount = useRef(enabled);
  useEffect(() => {
    if (focusOnMount.current) {
      ref.current?.focus();
    }
  }, [ref]);
}
