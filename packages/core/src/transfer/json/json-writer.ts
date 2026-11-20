import { STJ_ESCAPED_RANGES } from "./stj-escaped-ranges.js";
import { formatStjDouble } from "./stj-number.js";

/**
 * A value for the export writer. Integers and doubles are kept apart because the
 * legacy exporter formatted them differently.
 */
export type JsonOut =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "integer"; readonly value: number }
  | { readonly kind: "double"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "array"; readonly items: readonly JsonOut[] }
  | { readonly kind: "object"; readonly members: ReadonlyArray<readonly [string, JsonOut]> };

/** A string value. */
export const jsonString = (value: string): JsonOut => ({ kind: "string", value });
/** A whole number written without a fraction. */
export const jsonInteger = (value: number): JsonOut => ({ kind: "integer", value });
/** A double written with the legacy shortest round-trip format. */
export const jsonDouble = (value: number): JsonOut => ({ kind: "double", value });
/** A Boolean value. */
export const jsonBoolean = (value: boolean): JsonOut => ({ kind: "boolean", value });
/** An array value. */
export const jsonArray = (items: readonly JsonOut[]): JsonOut => ({ kind: "array", items });

/** An object whose null or undefined members are left out, as the legacy exporter did. */
export function jsonObject(
  members: ReadonlyArray<readonly [string, JsonOut | null | undefined]>,
): JsonOut {
  const present = members.filter(
    (member): member is readonly [string, JsonOut] => member[1] != null,
  );
  return { kind: "object", members: present };
}

function isEscaped(code: number): boolean {
  let low = 0;
  let high = STJ_ESCAPED_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last] = STJ_ESCAPED_RANGES[middle]!;
    if (code < first) {
      high = middle - 1;
    } else if (code > last) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  8: "\\b",
  9: "\\t",
  10: "\\n",
  12: "\\f",
  13: "\\r",
  34: '\\"',
  92: "\\\\",
};

const hex = (code: number) => `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;

function isHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLow(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Escapes one UTF-16 unit. A surrogate pair becomes two escapes and a lone surrogate `\\uFFFD`. */
function escapeUnit(text: string, index: number): string {
  const code = text.charCodeAt(index);
  if (isHigh(code) && isLow(text.charCodeAt(index + 1))) {
    return hex(code);
  }
  if (isLow(code) && isHigh(text.charCodeAt(index - 1))) {
    return hex(code);
  }
  if (isHigh(code) || isLow(code)) {
    return hex(0xfffd);
  }
  return SHORT_ESCAPES[code] ?? (isEscaped(code) ? hex(code) : text[index]!);
}

/** A JSON string literal escaped exactly like `JavaScriptEncoder.UnsafeRelaxedJsonEscaping`. */
export function quoteStjString(value: string): string {
  let result = '"';
  for (let index = 0; index < value.length; index++) {
    result += escapeUnit(value, index);
  }
  return `${result}"`;
}

function writeValue(value: JsonOut, indent: string, newline: string): string {
  switch (value.kind) {
    case "string":
      return quoteStjString(value.value);
    case "integer":
      return String(value.value);
    case "double":
      return formatStjDouble(value.value);
    case "boolean":
      return value.value ? "true" : "false";
    case "array":
      return writeList(
        "[",
        "]",
        value.items.map((item) => [null, item] as const),
        indent,
        newline,
      );
    case "object":
      return writeList("{", "}", value.members, indent, newline);
  }
}

function writeList(
  open: string,
  close: string,
  entries: ReadonlyArray<readonly [string | null, JsonOut]>,
  indent: string,
  newline: string,
): string {
  if (entries.length === 0) {
    return open + close;
  }
  const inner = `${indent}  `;
  const lines = entries.map(([name, value]) => {
    const key = name === null ? "" : `${quoteStjString(name)}: `;
    return inner + key + writeValue(value, inner, newline);
  });
  return `${open}${newline}${lines.join(`,${newline}`)}${newline}${indent}${close}`;
}

/**
 * Writes indented JSON byte-compatible with the legacy exporter: two-space indent,
 * `"name": value`, empty lists as `[]`, and `newline` between lines (the legacy
 * exporter used the platform's line ending).
 */
export function writeJson(value: JsonOut, newline = "\n"): string {
  return writeValue(value, "", newline);
}
