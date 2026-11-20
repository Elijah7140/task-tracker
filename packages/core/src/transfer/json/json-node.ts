/**
 * A parsed JSON value that keeps what the legacy reader needed: object members in
 * file order (with duplicates and original spelling) and the raw text of numbers.
 */
export type JsonNode =
  | { readonly type: "null" }
  | { readonly type: "boolean"; readonly value: boolean }
  | { readonly type: "number"; readonly raw: string }
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "array"; readonly items: readonly JsonNode[] }
  | { readonly type: "object"; readonly members: ReadonlyArray<readonly [string, JsonNode]> };

/** The first member named `name`, ignoring case like the legacy header check, or undefined. */
export function findMember(node: JsonNode, name: string): JsonNode | undefined {
  if (node.type !== "object") {
    return undefined;
  }
  const lower = name.toLowerCase();
  return node.members.find(([key]) => key.toLowerCase() === lower)?.[1];
}
