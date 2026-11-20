import { MetadataRuleError } from "../metadata/metadata-rule-error.js";

/**
 * The two kinds of item (§7.19). A ToDo carries the built-in and custom fields; a Ticket
 * carries the fixed ticket fields. The kind is chosen when the item is added.
 */
export type ItemKind = "Todo" | "Ticket";

/** Every item kind, in the order the add buttons show them. */
export const ITEM_KINDS: readonly ItemKind[] = ["Todo", "Ticket"];

/** Narrows stored or received text to an item kind. */
export function isItemKind(value: unknown): value is ItemKind {
  return value === "Todo" || value === "Ticket";
}

/** A ticket always has the number it was copied from the company ticket system with. */
export function requireTicketNumber(kind: ItemKind, ticketNumber: string | null) {
  if (kind === "Ticket" && ticketNumber === null) {
    throw new MetadataRuleError("A ticket needs a ticket number.");
  }
}
