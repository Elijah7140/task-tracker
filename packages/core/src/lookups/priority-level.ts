import type { LookupEntity } from "./lookup-entity.js";

/** A priority whose position in the list determines its rank. */
export interface PriorityLevel extends LookupEntity {
  readonly iconKey?: never;
}
