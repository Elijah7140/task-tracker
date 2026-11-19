import type { LookupEntity } from "./lookup-entity.js";

/** A priority whose position in the list determines its rank. */
export interface PriorityLevel extends LookupEntity {
  readonly number: number | null;
  readonly iconKey?: never;
}

/** Formats the optional number and name for display in lookup lists and item surfaces. */
export function priorityLabel({ name, number }: Pick<PriorityLevel, "name" | "number">): string {
  if (number === null) {
    return name;
  }
  return name === "" ? String(number) : `${number} · ${name}`;
}
