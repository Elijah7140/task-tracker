import { Bug, Diamond, MessagesSquare, Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const builtInIcons: Readonly<Record<string, LucideIcon>> = {
  Change: Pencil,
  Error: Bug,
  Discussion: MessagesSquare,
};

/** Props for {@link ItemTypeIcon}. */
export interface ItemTypeIconProps {
  /** The type's name, or null for an item without a type. */
  readonly name: string | null;
}

/**
 * A small glyph for an item's type, as the legacy rows showed. Seeded types
 * have their own icon and user types share a diamond. An item without a type
 * shows nothing, so a sub-item row reads as a dotted list with only its
 * completion circle (§7.17). The name reaches assistive technology through the
 * row description.
 */
export function ItemTypeIcon({ name }: ItemTypeIconProps) {
  if (name === null) {
    return null;
  }
  const Icon = builtInIcons[name] ?? Diamond;
  return (
    <span
      aria-hidden="true"
      title={name}
      data-testid="item-type"
      className="grid size-4 shrink-0 place-items-center text-fg-subtle"
    >
      <Icon size={13} strokeWidth={2} />
    </span>
  );
}
