/* Helpers for reading, editing and comparing exported JSON in tests, like legacy TransferJson. */

// oxlint-disable-next-line typescript/no-explicit-any -- edited documents are free-form JSON
export type JsonDocument = Record<string, any>;

/** Parses export text. */
export const parseJson = (text: string): JsonDocument => JSON.parse(text) as JsonDocument;

/** Applies an edit to the parsed document and returns the changed text. */
export function editJson(text: string, edit: (document: JsonDocument) => void): string {
  const document = parseJson(text);
  edit(document);
  return JSON.stringify(document);
}

/** The project object with this name. */
export function projectNamed(document: JsonDocument, name: string): JsonDocument {
  return (document.projects as JsonDocument[]).find((project) => project.name === name)!;
}

/** The item object with this title anywhere in the document. */
export function itemTitled(document: JsonDocument, title: string): JsonDocument {
  const items = (document.projects as JsonDocument[]).flatMap(
    (project) => project.items as JsonDocument[],
  );
  return items.find((item) => item.title === title)!;
}

/** The index of an item in its project's list. */
export function itemIndex(document: JsonDocument, projectName: string, title: string): number {
  return (projectNamed(document, projectName).items as JsonDocument[]).findIndex(
    (item) => item.title === title,
  );
}

/** The field definition with this key. */
export function fieldKeyed(document: JsonDocument, key: string): JsonDocument {
  return (document.fields as JsonDocument[]).find((field) => field.key === key)!;
}

/** An item's field values. */
export const fieldValues = (document: JsonDocument, title: string) =>
  itemTitled(document, title).fieldValues as JsonDocument[];

const GUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

/**
 * The document with every GUID replaced by a number in order of first appearance
 * and the export time removed, so exports of equal data compare equal.
 */
export function withoutIds(text: string): string {
  const document = parseJson(text);
  delete document.exportedAtUtc;
  const numbers = new Map<string, string>();
  return JSON.stringify(document).replace(GUID, (id) => {
    if (!numbers.has(id)) {
      numbers.set(id, `id${numbers.size}`);
    }
    return numbers.get(id)!;
  });
}

/** A random uppercase GUID for edits. */
export const randomGuid = () => crypto.randomUUID().toUpperCase();
