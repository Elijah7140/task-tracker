import type { ItemLink as WireItemLink } from "@task-tracker/contracts";
import type { ItemLink } from "@task-tracker/core";

/** Projects a stored link to the wire shape the editor lists. */
export function projectItemLink(link: ItemLink): typeof WireItemLink.Type {
  return { id: link.id, url: link.url, title: link.title, sortOrder: link.sortOrder };
}
