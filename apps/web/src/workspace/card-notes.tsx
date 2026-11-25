import { isBlankText } from "@task-tracker/contracts";
import { NotebookPen } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import { MarkdownPreview } from "../editor/markdown-preview.js";
import { cx } from "../ui/class-names.js";

/** Props for {@link CardNotes}. */
export interface CardNotesProps {
  /** The item's title, for accessible names. */
  readonly title: string;
  /** The item's Markdown notes (§7.10), or null when it has none. */
  readonly notes: string | null;
  /** Shows "Add notes" without hovering, as for the selected card. */
  readonly revealAdd: boolean;
  /** Saves the edited Markdown. Resolves true once saved, which closes the editor. */
  readonly onSave: (notes: string) => Promise<boolean>;
}

const stop = (event: MouseEvent) => event.stopPropagation();

/** Presses on links and other buttons in the rendered notes run those controls instead. */
function startsOnControl(event: MouseEvent<HTMLElement>) {
  return (event.target as Element).closest("button, a") !== null;
}

/** The card's tree item, which takes focus back once the editor closes. */
function owningItem(element: HTMLElement) {
  return element.closest<HTMLElement>('[role="treeitem"]');
}

function NotesEditor({
  title,
  initial,
  onSave,
  onClose,
}: {
  readonly title: string;
  readonly initial: string;
  readonly onSave: (notes: string) => Promise<boolean>;
  readonly onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  // Set while a save runs and once the editor is done, so a later blur saves nothing.
  const busy = useRef(false);

  const save = async () => {
    if (busy.current) {
      return false;
    }
    busy.current = true;
    const saved = await onSave(draft).catch(() => false);
    busy.current = saved;
    if (saved) {
      onClose();
    }
    return saved;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      busy.current = true;
      owningItem(event.currentTarget)?.focus();
      onClose();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      const owner = owningItem(event.currentTarget);
      void save().then((saved) => saved && owner?.focus());
    }
  };

  return (
    <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => void save()}
      aria-label={`Notes for ${title}`}
      // What is saved, so the tray card can tell unsaved typing apart (§7.18).
      data-saved-value={initial}
      placeholder="Markdown notes. Ctrl+Enter saves, Escape cancels."
      data-testid="item-card-notes-editor"
      autoFocus
      rows={3}
      spellCheck
      className="field-sizing-content min-h-16 w-full resize-none rounded-control border border-line-strong bg-canvas px-2 py-1.5 font-mono text-xs leading-relaxed text-fg outline-none focus-visible:ring-3 focus-visible:ring-focus"
    />
  );
}

/**
 * A card's notes (§7.17): the item's Markdown notes rendered in full, so bullet lists
 * read as lists. A click swaps in the raw Markdown; blur or Ctrl+Enter saves one undoable
 * edit and Escape cancels. An empty card shows "Add notes" only on hover or selection.
 */
export function CardNotes({ title, notes, revealAdd, onSave }: CardNotesProps) {
  const [editing, setEditing] = useState(false);
  const source = notes ?? "";
  const empty = isBlankText(source);
  const close = () => setEditing(false);

  let content;
  if (editing) {
    content = <NotesEditor title={title} initial={source} onSave={onSave} onClose={close} />;
  } else if (empty) {
    content = (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setEditing(true)}
        aria-label={`Add notes to ${title}`}
        data-testid="item-card-notes-add"
        className={cx(
          "flex h-6 cursor-default items-center gap-1.5 rounded-control px-1 text-xs text-fg-subtle hover:bg-hover hover:text-fg-muted focus-visible:opacity-100",
          revealAdd ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
        )}
      >
        <NotebookPen size={12} aria-hidden="true" />
        Add notes
      </button>
    );
  } else {
    content = (
      <div
        data-testid="item-card-notes"
        title="Click to edit notes"
        onClick={(event) => {
          if (!startsOnControl(event)) {
            setEditing(true);
          }
        }}
        className="cursor-text rounded-control px-1 py-0.5 hover:bg-hover"
      >
        <MarkdownPreview
          source={source}
          testId="item-card-notes-preview"
          className="text-xs text-fg-muted"
        />
      </div>
    );
  }
  return (
    <div data-no-item-drag="" onDoubleClick={stop} className="min-w-0">
      {content}
    </div>
  );
}
