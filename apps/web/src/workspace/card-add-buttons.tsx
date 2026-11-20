import { ListPlus, TicketPlus } from "lucide-react";
import type { ReactNode } from "react";
import type { AddKind } from "../add/add-item-draft.js";

const KIND_LABELS: Readonly<Record<AddKind, string>> = { Todo: "ToDo", Ticket: "Ticket" };

const KIND_ICONS: Readonly<Record<AddKind, ReactNode>> = {
  Todo: <ListPlus size={14} aria-hidden="true" />,
  Ticket: <TicketPlus size={14} aria-hidden="true" />,
};

/**
 * One of a card's add buttons (§7.19), under its ☆ and ⋯. Like those it shows on hover and
 * takes no Tab stop; the card's menu offers the same actions from the keyboard.
 */
export function CardAddButton({
  kind,
  title,
  onAdd,
}: {
  readonly kind: AddKind;
  readonly title: string;
  readonly onAdd: (kind: AddKind) => void;
}) {
  const label = `Add ${KIND_LABELS[kind]} under ${title}`;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={`Add ${KIND_LABELS[kind]}`}
      data-testid={`item-card-add-${kind.toLowerCase()}`}
      onClick={(event) => {
        event.stopPropagation();
        onAdd(kind);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className="grid size-6 shrink-0 cursor-default place-items-center rounded-[0.3125rem] text-fg-subtle opacity-0 transition-colors group-hover/card:opacity-100 hover:bg-pressed hover:text-fg"
    >
      {KIND_ICONS[kind]}
    </button>
  );
}
