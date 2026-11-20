/** A web or mail link attached to an item, listed in the editor's Links section (§7.10). */
export interface ItemLink {
  readonly id: string;
  readonly itemId: string;
  /** A trimmed absolute http, https or mailto address. */
  readonly url: string;
  /** An optional label shown instead of the address. */
  readonly title: string | null;
  /** The position among the item's links, always numbered 0, 1, 2... */
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
}

/** One entry of the editor's link list. A null ID adds a new link. */
export interface ItemLinkInput {
  readonly id: string | null;
  readonly url: string;
  readonly title: string | null;
}
