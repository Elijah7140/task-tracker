import { isBlankText } from "@task-tracker/contracts";
import { Plus } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  useEffect,
  useRef,
} from "react";
import { cx } from "../ui/class-names.js";
import { useItemSurface } from "./item-surface.js";

/** Props for {@link OutlineAddInput}. */
export interface OutlineAddInputProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /**
   * Adds the typed title: as the next item at this line's level, or as a child for
   * Shift+Enter. Resolves true once added, which clears the line.
   */
  readonly onSubmit: (title: string, asChild: boolean) => Promise<boolean>;
  /** Escape on a line that is already empty. */
  readonly onEscape: (input: HTMLInputElement) => void;
  /** Focus left the line while it was empty. */
  readonly onBlurEmpty?: (() => void) | undefined;
  readonly label: string;
  readonly placeholder: string;
  readonly testId: string;
  readonly autoFocus?: boolean | undefined;
  /** Indents the line to an outline depth, in rem. */
  readonly indent?: number | undefined;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  /** Runs once the input is in the document, for example after it moved to a new row. */
  readonly onMounted?: (() => void) | undefined;
}

const stop = (event: MouseEvent) => event.stopPropagation();

/** Enter adds at this level and Shift+Enter adds a child; other modifiers leave Enter alone. */
function enterIntent(event: KeyboardEvent<HTMLInputElement>): "sibling" | "child" | null {
  if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }
  return event.shiftKey ? "child" : "sibling";
}

/**
 * A single-line outliner input inside a card (§7.17), like a line of a dotted list. It keeps
 * its own clicks away from the card, so pressing in it never selects, opens or drags the card.
 * A submit that is still running ignores further Enters, so items land in typing order.
 */
export function OutlineAddInput(props: OutlineAddInputProps) {
  const { value, onValueChange, onSubmit, onEscape, onBlurEmpty } = props;
  const surface = useItemSurface();
  const pending = useRef(false);
  // Only the first mount matters: it marks the end of a move to another row.
  const mounted = useRef(props.onMounted);

  useEffect(() => mounted.current?.(), []);

  const submit = async (asChild: boolean) => {
    if (pending.current || isBlankText(value)) {
      return;
    }
    pending.current = true;
    try {
      await onSubmit(value, asChild);
    } finally {
      pending.current = false;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const intent = enterIntent(event);
    if (intent !== null) {
      event.preventDefault();
      void submit(intent === "child");
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (value.length > 0) {
        onValueChange("");
      } else {
        onEscape(event.currentTarget);
      }
    }
  };

  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (event.currentTarget.isConnected && !pending.current && isBlankText(value)) {
      onBlurEmpty?.();
    }
  };

  return (
    <div
      data-no-item-drag=""
      onClick={stop}
      onDoubleClick={stop}
      style={props.indent === undefined ? undefined : { paddingLeft: `${props.indent}rem` }}
      className={cx(
        "flex min-h-7 min-w-0 items-center gap-1 rounded-control pr-1 text-[13px] text-fg-muted",
        "focus-within:bg-hover hover:bg-hover",
      )}
    >
      <span className="w-4 shrink-0" aria-hidden="true" />
      <span className="grid size-5 shrink-0 place-items-center text-fg-subtle" aria-hidden="true">
        <Plus size={14} />
      </span>
      <input
        ref={props.inputRef}
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        aria-label={props.label}
        placeholder={props.placeholder}
        data-testid={props.testId}
        // Like the card's hover actions it takes no Tab stop, so the tree stays one (§8).
        // A tray card has no editor to add with, so there the line takes one (§7.18).
        tabIndex={surface === "tray" ? undefined : -1}
        autoFocus={props.autoFocus}
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent pl-0.5 text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
