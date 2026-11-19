import type { SavedSearchProjection } from "@task-tracker/contracts";
import { Bookmark, BookmarkPlus, Pencil, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";

type SavedSearch = typeof SavedSearchProjection.Type;

const CHIP =
  "inline-flex h-7 max-w-64 cursor-default items-center gap-1 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap select-none transition-colors duration-100";
const CHIP_IDLE = "border-line bg-surface text-fg shadow-card hover:bg-hover";
const CHIP_CURRENT = "border-accent bg-accent-soft text-accent-text";

/** Props for {@link SavedSearchChips}. */
export interface SavedSearchChipsProps {
  readonly searches: ReadonlyArray<SavedSearch>;
  readonly selectedId: string | null;
  readonly onOpen: (savedSearchId: string) => void;
}

/** One chip per saved search, in stored order. The open one is marked current (§7.7). */
export function SavedSearchChips({ searches, selectedId, onOpen }: SavedSearchChipsProps) {
  if (searches.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Saved searches" data-testid="saved-search-chips" className="-mt-4 mb-6">
      <ul className="flex flex-wrap gap-2">
        {searches.map((search) => {
          const current = search.id === selectedId;
          return (
            <li key={search.id}>
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                data-testid="saved-search-chip"
                className={cx(CHIP, current ? CHIP_CURRENT : CHIP_IDLE)}
                onClick={() => onOpen(search.id)}
              >
                <Bookmark size={13} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{search.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Props for {@link SavedSearchActions}. */
export interface SavedSearchActionsProps {
  readonly selected: SavedSearch | null;
  readonly saveRef: RefObject<HTMLButtonElement | null>;
  readonly onSave: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}

/** Save search, plus Rename and Delete for the saved search currently open (§7.7). */
export function SavedSearchActions({
  selected,
  saveRef,
  onSave,
  onRename,
  onDelete,
}: SavedSearchActionsProps) {
  return (
    <>
      {selected === null ? null : (
        <>
          <Button
            variant="ghost"
            aria-label="Rename saved search"
            data-testid="rename-saved-search"
            onClick={onRename}
          >
            <Pencil size={14} aria-hidden="true" />
            Rename
          </Button>
          <Button
            variant="ghost"
            aria-label="Delete saved search"
            data-testid="delete-saved-search"
            onClick={onDelete}
          >
            <Trash2 size={14} aria-hidden="true" />
            Delete
          </Button>
        </>
      )}
      <Button ref={saveRef} data-testid="save-search" onClick={onSave}>
        <BookmarkPlus size={14} aria-hidden="true" />
        Save search
      </Button>
    </>
  );
}
