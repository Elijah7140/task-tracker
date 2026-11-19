import { Input } from "@base-ui/react/input";
import { ArrowDown, ArrowUp, Link2, Mail, Pencil, X } from "lucide-react";
import { type KeyboardEvent, type ReactElement, type RefObject, useId, useRef } from "react";
import { openExternalLink } from "../native/open-external-link.js";
import { altArrowDirection } from "../ui/alt-arrow-direction.js";
import { Button } from "../ui/button.js";
import { fieldStyles } from "../ui/field-styles.js";
import { LoadFailure } from "../ui/load-failure.js";
import { Tooltip } from "../ui/tooltip.js";
import { useRestoreRowFocus } from "../ui/use-restore-row-focus.js";
import { EditorGroup } from "./editor-group.js";
import {
  beginLinkEdit,
  canCancelLinkEntry,
  cancelLinkEntry,
  currentLinkRows,
  type LinkDraft,
  type LinkEntryField,
  type LinkRow,
  moveLink,
  removeLink,
  setLinkEntry,
  type StoredLink,
  submitLinkEntry,
} from "./link-draft.js";
import type { ItemLinksState } from "./use-item-links.js";

/** Props for {@link LinksSection}. */
export interface LinksSectionProps {
  readonly state: ItemLinksState;
  readonly draft: LinkDraft;
  readonly onChange: (change: (draft: LinkDraft) => LinkDraft) => void;
}

type ChangeLinks = LinksSectionProps["onChange"];

/** The attribute that names each focusable control, so focus can follow a row that moved. */
const FOCUS_ATTRIBUTE = "data-link-focus-id";
const ENTRY_FOCUS = "entry";

let linkKeySequence = 0;
const newLinkKey = () => `new-link-${++linkKeySequence}`;

function RowAction({
  label,
  tooltip,
  focusId,
  disabled = false,
  onClick,
  icon,
}: {
  readonly label: string;
  readonly tooltip: string;
  readonly focusId: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly icon: ReactElement;
}) {
  return (
    <Tooltip content={tooltip}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        disabled={disabled}
        focusableWhenDisabled
        onClick={onClick}
        {...{ [FOCUS_ATTRIBUTE]: focusId }}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}

interface LinkRowProps {
  readonly row: LinkRow;
  readonly first: boolean;
  readonly last: boolean;
  readonly onMove: (offset: -1 | 1, focusTarget: string) => void;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}

function LinkOpenButton({ row, onMove }: Pick<LinkRowProps, "row" | "onMove">) {
  const name = row.title ?? row.url;
  const Icon = row.url.toLowerCase().startsWith("mailto:") ? Mail : Link2;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = altArrowDirection(event);
    if (direction !== null) {
      event.preventDefault();
      onMove(direction, "open");
    }
  };
  return (
    <button
      type="button"
      aria-label={name}
      title={row.url}
      onClick={() => void openExternalLink(row.url)}
      onKeyDown={onKeyDown}
      data-testid="item-editor-link-open"
      {...{ [FOCUS_ATTRIBUTE]: `${row.key}:open` }}
      className="flex min-w-0 flex-1 cursor-default flex-col items-start rounded-control px-2 py-1 text-left outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus"
    >
      <span className="flex max-w-full items-center gap-1.5">
        <Icon size={13} aria-hidden="true" className="shrink-0 text-fg-subtle" />
        <span className="truncate text-sm text-accent-text">{name}</span>
      </span>
      {row.title === null ? null : (
        <span className="max-w-full truncate pl-5 text-xs text-fg-subtle">{row.url}</span>
      )}
    </button>
  );
}

/** One listed link: open it, move it, load it into the boxes or remove it. */
function LinkListRow({ row, first, last, onMove, onEdit, onRemove }: LinkRowProps) {
  const name = row.title ?? row.url;
  return (
    <li data-testid="item-editor-link" className="flex min-w-0 items-center gap-0.5">
      <LinkOpenButton row={row} onMove={onMove} />
      <RowAction
        label={`Move link ${name} up`}
        tooltip="Move up"
        focusId={`${row.key}:up`}
        disabled={first}
        onClick={() => onMove(-1, "up")}
        icon={<ArrowUp size={14} aria-hidden="true" />}
      />
      <RowAction
        label={`Move link ${name} down`}
        tooltip="Move down"
        focusId={`${row.key}:down`}
        disabled={last}
        onClick={() => onMove(1, "down")}
        icon={<ArrowDown size={14} aria-hidden="true" />}
      />
      <RowAction
        label={`Edit link ${name}`}
        tooltip="Edit this link"
        focusId={`${row.key}:edit`}
        onClick={onEdit}
        icon={<Pencil size={14} aria-hidden="true" />}
      />
      <RowAction
        label={`Remove link ${name}`}
        tooltip="Remove this link"
        focusId={`${row.key}:remove`}
        onClick={onRemove}
        icon={<X size={14} aria-hidden="true" />}
      />
    </li>
  );
}

function EntryBox({
  field,
  draft,
  errorId,
  onChange,
  onSubmit,
}: {
  readonly field: LinkEntryField;
  readonly draft: LinkDraft;
  readonly errorId: string;
  readonly onChange: ChangeLinks;
  readonly onSubmit: () => void;
}) {
  const address = field === "url";
  const invalid = address && draft.error !== null;
  return (
    <Input
      value={draft[field]}
      onValueChange={(value: string) => onChange((links) => setLinkEntry(links, field, value))}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
      }}
      aria-label={address ? "Link address" : "Link title"}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={invalid ? errorId : undefined}
      placeholder={address ? "https://example.com" : "Title (optional)"}
      autoComplete="off"
      spellCheck={false}
      data-testid={address ? "item-editor-link-url" : "item-editor-link-title"}
      {...(address ? { [FOCUS_ATTRIBUTE]: ENTRY_FOCUS } : {})}
      className={fieldStyles.compactControl}
    />
  );
}

/** The address and title boxes with Add or Update link, Cancel and the rejection message. */
function LinkEntry({
  rows,
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  readonly rows: ReadonlyArray<LinkRow>;
  readonly draft: LinkDraft;
  readonly onChange: ChangeLinks;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}) {
  const errorId = useId();
  const boxProps = { draft, errorId, onChange, onSubmit };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-1.5">
        <EntryBox field="url" {...boxProps} />
        <EntryBox field="title" {...boxProps} />
      </div>
      {draft.error === null ? null : (
        <p id={errorId} data-testid="item-editor-link-error" className={fieldStyles.error}>
          {draft.error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={onSubmit} data-testid="item-editor-link-submit">
          {draft.editingKey === null ? "Add link" : "Update link"}
        </Button>
        {canCancelLinkEntry(rows, draft) ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            data-testid="item-editor-link-cancel"
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The list and entry actions on the current draft. Each one names the control
 * that should hold focus afterwards, since moved or removed rows lose it.
 */
function useLinkActions(
  stored: ReadonlyArray<StoredLink>,
  draft: LinkDraft,
  onChange: ChangeLinks,
  containerRef: RefObject<HTMLElement | null>,
) {
  const restoreFocus = useRestoreRowFocus(containerRef, FOCUS_ATTRIBUTE, draft);
  const rows = currentLinkRows(stored, draft);
  const move = (key: string, offset: -1 | 1, focusTarget: string) => {
    restoreFocus(`${key}:${focusTarget}`);
    onChange((links) => moveLink(stored, links, key, offset));
  };
  const remove = (index: number) => {
    const neighbour = rows[index + 1] ?? rows[index - 1];
    restoreFocus(neighbour === undefined ? ENTRY_FOCUS : `${neighbour.key}:open`);
    onChange((links) => removeLink(stored, links, rows[index]!.key));
  };
  const edit = (key: string) => {
    const next = beginLinkEdit(stored, draft, key);
    restoreFocus(next.editingKey === key && draft.editingKey !== key ? ENTRY_FOCUS : null);
    onChange(() => next);
  };
  const submit = () => onChange((links) => submitLinkEntry(stored, links, newLinkKey));
  const cancel = () => {
    restoreFocus(ENTRY_FOCUS);
    onChange(cancelLinkEntry);
  };
  return { rows, move, remove, edit, submit, cancel };
}

function LinkEditor({
  stored,
  draft,
  onChange,
}: Omit<LinksSectionProps, "state"> & { readonly stored: ReadonlyArray<StoredLink> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { rows, move, remove, edit, submit, cancel } = useLinkActions(
    stored,
    draft,
    onChange,
    containerRef,
  );
  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {rows.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">No links yet.</p>
      ) : (
        <ul aria-label="Links" className="-mx-2 flex flex-col">
          {rows.map((row, index) => (
            <LinkListRow
              key={row.key}
              row={row}
              first={index === 0}
              last={index === rows.length - 1}
              onMove={(offset, focusTarget) => move(row.key, offset, focusTarget)}
              onEdit={() => edit(row.key)}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      )}
      <LinkEntry
        rows={rows}
        draft={draft}
        onChange={onChange}
        onSubmit={submit}
        onCancel={cancel}
      />
    </div>
  );
}

function LinksLoading() {
  return (
    <div aria-busy="true" aria-label="Loading links" data-testid="item-editor-links-loading">
      <div className="h-8 animate-pulse rounded-control bg-hover" />
    </div>
  );
}

/**
 * The item's web and mail links (§7.10): open, reorder, edit or remove each
 * one, and add more with the address and title boxes. Changes are part of
 * the item draft and save with the rest of the item.
 */
export function LinksSection({ state, draft, onChange }: LinksSectionProps) {
  if (state.status === "failure") {
    return (
      <LoadFailure
        message={state.message}
        onRetry={state.retry}
        testId="item-editor-links-load-failure"
      />
    );
  }
  return (
    <EditorGroup title="Links" testId="item-editor-links">
      {state.status === "loading" ? (
        <LinksLoading />
      ) : (
        <LinkEditor stored={state.links} draft={draft} onChange={onChange} />
      )}
    </EditorGroup>
  );
}
