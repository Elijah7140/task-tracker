import { Plus } from "lucide-react";
import { type KeyboardEvent, type Ref, useState } from "react";

/** Props for {@link QuickAddRow}. */
export interface QuickAddRowProps {
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  readonly onSubmit: (title: string) => Promise<boolean>;
}

/**
 * Notion-style empty line at the end of the open list. Typing a title and
 * pressing Enter creates a top-level item in the current area.
 */
export function QuickAddRow({ inputRef, onSubmit }: QuickAddRowProps) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending || value.trim().length === 0) {
      return;
    }
    setPending(true);
    try {
      if (await onSubmit(value)) {
        setValue("");
      }
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.key === "Enter" && !modified) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      if (value.length > 0) {
        setValue("");
      } else {
        event.currentTarget.blur();
      }
    }
  };

  return (
    <div
      data-testid="quick-add-row"
      className="flex h-9 items-center gap-1.5 rounded-control pr-2 pl-1 text-fg-muted transition-colors hover:bg-hover focus-within:bg-hover focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-focus"
    >
      <span className="w-4 shrink-0" aria-hidden="true" />
      <span className="size-5 shrink-0" aria-hidden="true" />
      <span className="grid size-5 shrink-0 place-items-center text-fg-subtle" aria-hidden="true">
        <Plus size={15} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Add an item"
        placeholder="Add an item..."
        data-testid="quick-add-input"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent pl-0.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
