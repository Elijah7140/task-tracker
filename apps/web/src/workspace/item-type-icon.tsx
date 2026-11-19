import { Bug, Circle, Diamond, MessagesSquare, Pencil } from "lucide-react";
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
 * have their own icon, user types share a diamond and no type shows a dot.
 * The name is exposed for assistive technology through the row description.
 */
export function ItemTypeIcon({ name }: ItemTypeIconProps) {
  const Icon = name === null ? Circle : (builtInIcons[name] ?? Diamond);
  return (
    <span
      aria-hidden="true"
      title={name ?? undefined}
      data-testid="item-type"
      className="grid size-4 shrink-0 place-items-center text-fg-subtle"
    >
      <Icon size={name === null ? 5 : 13} strokeWidth={name === null ? 6 : 2} />
    </span>
  );
}
