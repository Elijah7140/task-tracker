import { Star } from "lucide-react";
import { Button } from "../ui/button.js";
import { CURRENT_ITEM_HINT } from "./current-item-star.js";
import { useCurrentItemId, useSetCurrentItem } from "./use-current-item.js";

/**
 * The editor heading's **Set as current** / **Current item** button (§7.18).
 * It makes the open item current, or clears the choice when it already is.
 */
export function CurrentItemButton({ itemId }: { readonly itemId: string }) {
  const current = useCurrentItemId() === itemId;
  const setCurrent = useSetCurrentItem();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={current}
      title={CURRENT_ITEM_HINT}
      onClick={() => void setCurrent(current ? null : itemId)}
      data-testid="item-editor-current-item"
    >
      <Star
        size={13}
        aria-hidden="true"
        className={current ? "text-accent" : undefined}
        fill={current ? "currentColor" : "none"}
        strokeWidth={current ? 2 : 1.75}
      />
      {current ? "Current item" : "Set as current"}
    </Button>
  );
}
