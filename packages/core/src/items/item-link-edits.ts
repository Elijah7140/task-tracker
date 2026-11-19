import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { ItemLink, ItemLinkInput } from "./item-link.js";
import * as LinkPolicy from "./link-policy.js";

/** The link rows to insert, update and delete for one item's replacement list. */
export interface ItemLinkEdits {
  readonly inserts: ReadonlyArray<ItemLink>;
  readonly updates: ReadonlyArray<ItemLink>;
  readonly removals: ReadonlyArray<string>;
}

function validateInputs(inputs: ReadonlyArray<ItemLinkInput>) {
  if (inputs.length > LinkPolicy.MAX_LINKS_PER_ITEM) {
    throw new MetadataRuleError(`An item may have at most ${LinkPolicy.MAX_LINKS_PER_ITEM} links.`);
  }
  for (const input of inputs) {
    const problem = LinkPolicy.validate(input.url, input.title);
    if (problem !== null) {
      throw new MetadataRuleError(problem);
    }
  }
  const ids = inputs.flatMap(({ id }) => (id === null ? [] : [id]));
  if (new Set(ids).size !== ids.length) {
    throw new MetadataRuleError("Each link may appear only once.");
  }
}

type LinkIdentity = Pick<ItemLink, "id" | "itemId" | "createdAtUtc">;

function replaced(identity: LinkIdentity, input: ItemLinkInput, sortOrder: number): ItemLink {
  return {
    id: identity.id,
    itemId: identity.itemId,
    url: LinkPolicy.normalizeUrl(input.url),
    title: LinkPolicy.normalizeTitle(input.title),
    sortOrder,
    createdAtUtc: identity.createdAtUtc,
  };
}

const sameLink = (left: ItemLink, right: ItemLink) =>
  left.url === right.url && left.title === right.title && left.sortOrder === right.sortOrder;

/**
 * Replaces one item's links with the editor's list (§7.10): links with a
 * stored ID are updated or kept, the rest are added with new IDs, stored
 * links missing from the list are removed, and list order becomes sort order.
 * Throws {@link MetadataRuleError} for an invalid list without planning writes.
 */
export function planItemLinkEdits(
  itemId: string,
  existing: ReadonlyArray<ItemLink>,
  inputs: ReadonlyArray<ItemLinkInput>,
  now: Temporal.Instant,
  newId: () => string,
): ItemLinkEdits {
  validateInputs(inputs);
  const byId = new Map(existing.map((link) => [link.id, link]));
  const inserts: Array<ItemLink> = [];
  const updates: Array<ItemLink> = [];
  inputs.forEach((input, sortOrder) => {
    const current = input.id === null ? undefined : byId.get(input.id);
    if (current === undefined) {
      inserts.push(replaced({ id: newId(), itemId, createdAtUtc: now }, input, sortOrder));
      return;
    }
    const next = replaced(current, input, sortOrder);
    if (!sameLink(current, next)) {
      updates.push(next);
    }
  });
  const kept = new Set(inputs.map(({ id }) => id));
  const removals = existing.filter(({ id }) => !kept.has(id)).map(({ id }) => id);
  return { inserts, updates, removals };
}
