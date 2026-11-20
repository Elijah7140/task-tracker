import { toLowerInvariant } from "./query-characters.js";

const MAX_DISTANCE = 2;

/** The Levenshtein distance: single-character inserts, deletes and replacements. */
function editDistance(first: string, second: string): number {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row++) {
    const current = [row];
    for (let column = 1; column <= second.length; column++) {
      const same = first.charAt(row - 1) === second.charAt(column - 1);
      const replace = previous[column - 1]! + (same ? 0 : 1);
      const insertOrDelete = Math.min(previous[column]!, current[column - 1]!) + 1;
      current.push(Math.min(replace, insertOrDelete));
    }
    previous = current;
  }
  return previous[second.length]!;
}

/** Returns the first nearest candidate within two edits of `input`, or null when none is close. */
export function suggestQueryKey(input: string, candidates: ReadonlyArray<string>): string | null {
  const lowered = toLowerInvariant(input);
  let best: string | null = null;
  let bestDistance = MAX_DISTANCE + 1;
  for (const candidate of candidates) {
    const distance = editDistance(lowered, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
