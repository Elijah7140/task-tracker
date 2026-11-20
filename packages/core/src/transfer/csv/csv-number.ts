/** A number like .NET `NumberStyles.Float` with the invariant culture: sign, dot, exponent. */
const FLOAT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Reads an invariant number such as `2.5`, `-3` or `1e3`, or null. A decimal
 * comma, thousands separators and values that overflow to infinity are refused.
 */
export function parseCsvNumber(text: string): number | null {
  if (!FLOAT.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
