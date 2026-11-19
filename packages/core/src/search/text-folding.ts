const SIGMA = "σ";
const FINAL_SIGMA = "ς";

/** Keeps a case mapping only when it maps to a single code point, like .NET. */
function simpleMapping(character: string, mapped: string): string {
  const isSingle = String.fromCodePoint(mapped.codePointAt(0) ?? 0) === mapped;
  return isSingle ? mapped : character;
}

function foldCharacter(character: string): string {
  const upper = simpleMapping(character, character.toUpperCase());
  return simpleMapping(upper, upper.toLowerCase());
}

/**
 * Folds text for Unicode-aware case-insensitive search comparisons, matching the
 * legacy `ToUpperInvariant().ToLowerInvariant()` rule. Upper-casing first maps every
 * Greek sigma form (σ, ς) to Σ before lower-casing. JavaScript then applies the
 * context-sensitive final-sigma rule, which .NET does not, so every ς becomes σ.
 * Like .NET, each code point uses its single-character mapping, so `ß` stays `ß`
 * rather than expanding to `ss`.
 * SQLite's `tt_fold` and the user's input both use this rule.
 */
export function foldSearchText(value: string): string {
  const folded = value.toUpperCase().toLowerCase();
  const simple =
    folded.length === value.length ? folded : Array.from(value, foldCharacter).join("");
  return simple.replaceAll(FINAL_SIGMA, SIGMA);
}
