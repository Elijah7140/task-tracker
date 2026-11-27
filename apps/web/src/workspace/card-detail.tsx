import { ChevronDown, ChevronUp } from "lucide-react";
import { type MouseEvent, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { MarkdownPreview } from "../editor/markdown-preview.js";
import { setDetailExpanded, useExpandedDetailsStore } from "../state/expanded-details-store.js";
import type { ItemNode } from "./item-outline.js";
import { useItemSurface } from "./item-surface.js";

/** Tailwind's two-line clamp, which ends the second line with "…". */
const CLAMP_CLASS = "line-clamp-2";

const stop = (event: MouseEvent) => event.stopPropagation();

function DetailPreview({ node }: { readonly node: ItemNode }) {
  return (
    <MarkdownPreview
      source={node.item.description ?? ""}
      testId="item-card-detail-preview"
      className="text-xs text-fg"
    />
  );
}

/** Whether the text runs past two lines, measured with the clamp applied for a moment. */
function overflowsClamp(element: HTMLElement) {
  const clamped = element.classList.contains(CLAMP_CLASS);
  element.classList.add(CLAMP_CLASS);
  const overflows = element.scrollHeight > element.clientHeight + 1;
  if (!clamped) {
    element.classList.remove(CLAMP_CLASS);
  }
  return overflows;
}

/** Tracks whether the element's text needs more than two lines, as its width or text changes. */
function useOverflowsClamp(ref: RefObject<HTMLElement | null>, source: string) {
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const measure = () => setOverflows(overflowsClamp(element));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, source]);
  return overflows;
}

function DetailToggle({
  title,
  expanded,
  controls,
  onToggle,
}: {
  readonly title: string;
  readonly expanded: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={`${expanded ? "Show less" : "Show more"} of the description of ${title}`}
      data-testid="item-card-detail-toggle"
      className="flex h-5 cursor-default items-center gap-0.5 self-start rounded-control px-1 text-xs font-medium text-accent-text outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus"
    >
      {expanded ? "Show less" : "Show more"}
      <Icon size={12} aria-hidden="true" />
    </button>
  );
}

/**
 * An in-progress card's Detail (§7.18): two lines ending in "…" with Show more, or the
 * whole text with Show less. The choice is kept per item until the user changes it.
 */
function ClampedDetail({ node }: { readonly node: ItemNode }) {
  const text = useRef<HTMLDivElement>(null);
  const itemId = node.item.id;
  const expanded = useExpandedDetailsStore((state) => state.ids.has(itemId));
  const overflows = useOverflowsClamp(text, node.item.description ?? "");
  const textId = `item-card-detail-text-${itemId}`;
  return (
    <div
      data-testid="item-card-detail"
      data-expanded={expanded}
      data-no-item-drag=""
      onDoubleClick={stop}
      className="flex flex-col gap-0.5 px-1 py-0.5"
    >
      <div
        ref={text}
        id={textId}
        data-testid="item-card-detail-text"
        className={expanded ? undefined : CLAMP_CLASS}
      >
        <DetailPreview node={node} />
      </div>
      {overflows ? (
        <DetailToggle
          title={node.item.title}
          expanded={expanded}
          controls={textId}
          onToggle={() => setDetailExpanded(itemId, !expanded)}
        />
      ) : null}
    </div>
  );
}

/**
 * The ticket's Detail as rendered Markdown above its notes, when the card shows it. The
 * workspace shows the whole text and the card grows to fit it (§7.17); an in-progress
 * card clamps it to two lines until expanded (§7.18).
 */
export function CardDetail({ node }: { readonly node: ItemNode }) {
  const surface = useItemSurface();
  if (surface === "tray") {
    return <ClampedDetail node={node} />;
  }
  return (
    <div data-testid="item-card-detail" className="px-1 py-0.5">
      <DetailPreview node={node} />
    </div>
  );
}
