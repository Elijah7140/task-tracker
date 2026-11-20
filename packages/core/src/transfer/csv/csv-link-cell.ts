import { MAX_LINKS_PER_ITEM } from "../../items/link-policy.js";

const WHITE_SPACE = /\p{White_Space}/u;

/** True for a UTF-16 code unit that .NET `char.IsWhiteSpace` accepts. */
const isWhiteSpace = (unit: string) => WHITE_SPACE.test(unit);

/**
 * Splits a Links cell into addresses separated by whitespace, or returns null
 * when it holds more than {@link MAX_LINKS_PER_ITEM} addresses.
 */
export function splitCsvLinks(cell: string): string[] | null {
  const addresses: string[] = [];
  let position = 0;
  while (position < cell.length) {
    if (isWhiteSpace(cell[position]!)) {
      position++;
      continue;
    }
    if (addresses.length === MAX_LINKS_PER_ITEM) {
      return null;
    }
    const start = position++;
    while (position < cell.length && !isWhiteSpace(cell[position]!)) {
      position++;
    }
    addresses.push(cell.slice(start, position));
  }
  return addresses;
}
