import type { ReactNode } from "react";
import { MenuRadioGroup, MenuRadioItem, MenuSubmenu } from "../ui/menu.js";

const NONE = "none";

/** A lookup entry offered in an item row's submenu. */
export interface RowLookupEntry {
  readonly id: string;
  readonly label: string;
  readonly isArchived: boolean;
  readonly sortOrder: number;
}

/** Props for {@link RowLookupMenu}. */
export interface RowLookupMenuProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly entries: ReadonlyArray<RowLookupEntry>;
  readonly currentId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly testId: string;
}

/**
 * "None", then the active entries in list order, plus the item's current entry when it has
 * been archived, so the current value always shows as checked.
 */
export function rowLookupChoices(
  entries: ReadonlyArray<RowLookupEntry>,
  currentId: string | null,
): ReadonlyArray<{ readonly value: string; readonly label: string }> {
  const offered = entries
    .filter((entry) => !entry.isArchived || entry.id === currentId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((entry) => ({ value: entry.id, label: entry.label }));
  return [{ value: NONE, label: "None" }, ...offered];
}

/** A Set status or Set priority submenu shared by item row menus. Choosing an entry saves it. */
export function RowLookupMenu({
  label,
  icon,
  entries,
  currentId,
  onSelect,
  testId,
}: RowLookupMenuProps) {
  return (
    <MenuSubmenu label={label} icon={icon} testId={testId} popupTestId={`${testId}-popup`}>
      <MenuRadioGroup
        value={currentId ?? NONE}
        onValueChange={(value) => onSelect(value === NONE ? null : value)}
      >
        {rowLookupChoices(entries, currentId).map((choice) => (
          <MenuRadioItem key={choice.value} value={choice.value} testId={`${testId}-choice`}>
            {choice.label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </MenuSubmenu>
  );
}
