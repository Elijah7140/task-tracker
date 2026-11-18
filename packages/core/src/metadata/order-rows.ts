import { MetadataRuleError } from "./metadata-rule-error.js";

/** Returns the rows in the requested order with contiguous positions. */
export function orderRows<Row extends { id: string; sortOrder: number }>(
  rows: readonly Row[],
  ids: readonly string[],
  message = "Order must contain every row exactly once.",
): (Omit<Row, "sortOrder"> & { sortOrder: number })[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (ids.length !== rows.length || new Set(ids).size !== ids.length) {
    throw new MetadataRuleError(message);
  }

  return ids.map((id, sortOrder) => {
    const row = byId.get(id);
    if (!row) {
      throw new MetadataRuleError(message);
    }
    return { ...row, sortOrder };
  });
}
