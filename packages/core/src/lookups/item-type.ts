import type { LookupEntity } from "./lookup-entity.js";

/** A user-extensible item classification, optionally displayed with an icon. */
export interface ItemType extends LookupEntity {
  readonly iconKey: string | null;
}
