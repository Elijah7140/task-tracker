import { jsonObject, jsonString, type JsonOut } from "./json-writer.js";

/** A GUID as the legacy exporter wrote it: lowercase with hyphens, or null to leave it out. */
export const exportGuid = (id: string | null) =>
  id === null ? null : jsonString(id.toLowerCase());

/** An optional string member value; null leaves the member out. */
export const optionalString = (value: string | null) => (value === null ? null : jsonString(value));

/** Ordinal (UTF-16 code unit) comparison, as .NET `StringComparer.Ordinal`. */
export const ordinal = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

/** Setting text by key, sorted ordinally like the legacy `SortedDictionary`. */
export function settingsObject(settings: ReadonlyMap<string, string>): JsonOut {
  const keys = [...settings.keys()].toSorted(ordinal);
  return jsonObject(keys.map((key) => [key, jsonString(settings.get(key)!)]));
}
