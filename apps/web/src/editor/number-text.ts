/** The result of reading a number typed into a custom field. */
export type ParsedNumber =
  | { readonly kind: "blank" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "invalid" };

// Digits with one optional decimal point, sign and exponent; no grouping separators.
const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** The locale's decimal separator, such as "." for en-US or "," for fr-FR. */
function decimalSeparator(locale: string | undefined): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.5);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
}

/**
 * Shows a stored number as editable text in the locale, without grouping, so
 * that it parses back to the same value.
 */
export function formatNumber(value: number | null, locale?: string): string {
  if (value === null) {
    return "";
  }
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 20,
  }).format(value);
}

/**
 * Reads typed text as a finite number using the locale's decimal separator,
 * like the legacy editor's culture-aware parsing. Grouping separators,
 * Infinity and NaN are rejected.
 */
export function parseNumber(text: string, locale?: string): ParsedNumber {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: "blank" };
  }
  const separator = decimalSeparator(locale);
  const normalized = separator === "." ? trimmed : trimmed.replace(separator, ".");
  if (normalized.includes(",") || !NUMBER_PATTERN.test(normalized)) {
    return { kind: "invalid" };
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? { kind: "number", value } : { kind: "invalid" };
}
