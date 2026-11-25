import type { TodoItem } from "../items/todo-item.js";

/**
 * Whether automatic completion ties this item's state to its children. A ticket is
 * complete only through its status, so it never does; a ToDo above a ticket still
 * counts the ticket as a child (§6.1).
 */
export function followsChildren(item: TodoItem): boolean {
  return item.kind !== "Ticket";
}
