import { useCallback, useRef } from "react";
import type { ItemNode } from "./item-outline.js";

/** An item action that takes the item first. */
type ItemAction<Args extends ReadonlyArray<unknown>> = (
  node: ItemNode,
  ...args: Args
) => Promise<void>;

/**
 * Wraps item actions so a repeated run of the same action on the same item is
 * ignored while the first is in progress, including any dialog it shows. Like
 * the legacy AsyncRelayCommand, pressing Space twice on a parent therefore asks
 * once whether to complete its sub-items.
 */
export function useSingleRunPerItem() {
  const runningRef = useRef(new Set<string>());

  return useCallback(
    <Args extends ReadonlyArray<unknown>>(name: string, action: ItemAction<Args>) =>
      async (node: ItemNode, ...args: Args): Promise<void> => {
        const key = `${name}:${node.item.id}`;
        const running = runningRef.current;
        if (running.has(key)) {
          return;
        }
        running.add(key);
        try {
          await action(node, ...args);
        } finally {
          running.delete(key);
        }
      },
    [],
  );
}
