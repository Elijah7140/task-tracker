import { Star } from "lucide-react";
import { cx } from "../ui/class-names.js";
import { Tooltip } from "../ui/tooltip.js";
import { useCurrentItemId, useSetCurrentItem } from "./use-current-item.js";

/** Explains what the star means wherever it marks the current item. */
export const CURRENT_ITEM_HINT = "Current item, shown when you click the tray icon";

/**
 * The star in a workspace card's header (§7.18). An outline star shows on hover
 * and makes the item current; the current card keeps a filled star, and
 * clicking it again clears the choice. Like the card's other header buttons it
 * takes no Tab stop; the context menu offers the same choice from the keyboard.
 */
export function CurrentItemStar({
  itemId,
  title,
}: {
  readonly itemId: string;
  readonly title: string;
}) {
  const current = useCurrentItemId() === itemId;
  const setCurrent = useSetCurrentItem();
  const label = current ? `Clear current item ${title}` : `Set ${title} as current item`;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={current}
      title={current ? CURRENT_ITEM_HINT : "Set as current item"}
      data-testid="item-card-current"
      data-current={current}
      onClick={(event) => {
        event.stopPropagation();
        void setCurrent(current ? null : itemId);
      }}
      className={cx(
        "grid size-6 shrink-0 cursor-default place-items-center rounded-[0.3125rem] transition-colors hover:bg-pressed",
        current
          ? "text-accent"
          : "text-fg-subtle opacity-0 group-hover/card:opacity-100 hover:text-fg",
      )}
    >
      <Star
        size={14}
        aria-hidden="true"
        fill={current ? "currentColor" : "none"}
        strokeWidth={current ? 2 : 1.75}
      />
    </button>
  );
}

/** The ★ marker on a current sub-item row (§7.18). Nothing renders for other rows. */
export function CurrentItemMarker({ itemId }: { readonly itemId: string }) {
  if (useCurrentItemId() !== itemId) {
    return null;
  }
  return (
    <Tooltip content={CURRENT_ITEM_HINT}>
      <span
        role="img"
        aria-label="Current item"
        data-testid="item-current-marker"
        className="grid size-5 shrink-0 place-items-center text-accent"
      >
        <Star size={12} aria-hidden="true" fill="currentColor" strokeWidth={2} />
      </span>
    </Tooltip>
  );
}
