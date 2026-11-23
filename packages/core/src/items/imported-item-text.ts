import type { ItemKind } from "./item-kind.js";

/** An imported item's Detail and notes, as stored (§7.9, §7.19). */
export interface ImportedItemText {
  readonly description: string | null;
  readonly notes: string | null;
}

/**
 * Places an imported item's longer text. A ticket keeps its Detail and notes apart.
 * Files written before items had notes kept a ToDo's notes in Description, so a
 * ToDo's Description becomes its notes, joined ahead of any notes the file also has.
 */
export function importedItemText(
  kind: ItemKind,
  description: string | null,
  notes: string | null,
): ImportedItemText {
  if (kind === "Ticket" || description === null) {
    return { description: kind === "Ticket" ? description : null, notes };
  }
  return { description: null, notes: notes === null ? description : `${description}\n\n${notes}` };
}
