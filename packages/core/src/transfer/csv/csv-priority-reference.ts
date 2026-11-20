import { nameKey } from "../../metadata/names.js";
import { priorityLabel, type PriorityLevel } from "../../lookups/priority-level.js";

const NAME_PREFIX = "#name:";
const ID_PREFIX = "#id:";
const INT32_MAX = 2_147_483_647;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const same = (left: string, right: string) => nameKey(left) === nameKey(right);
const startsWithIgnoringCase = (text: string, prefix: string) =>
  same(text.slice(0, prefix.length), prefix);

/** A positive invariant integer of ASCII digits only, like .NET `NumberStyles.None`. */
function readNumber(text: string): number | null {
  if (!/^[0-9]+$/.test(text)) {
    return null;
  }
  const number = Number(text);
  return number > 0 && number <= INT32_MAX ? number : null;
}

/**
 * The Priority reference cell an export writes (§7.15): `#name:` and the name,
 * `#` and the number of a number-only level, or `#id:` for an archived one.
 */
export function writeCsvPriorityReference(level: PriorityLevel | null): string {
  if (level === null) {
    return "";
  }
  if (level.name.length > 0) {
    return NAME_PREFIX + level.name;
  }
  return level.isArchived ? `${ID_PREFIX}${level.id.toLowerCase()}` : `#${level.number}`;
}

/** The levels a Priority reference cell names; archived levels match only by id. */
export function matchCsvPriorityReference(
  cell: string,
  levels: readonly PriorityLevel[],
): PriorityLevel[] {
  if (startsWithIgnoringCase(cell, NAME_PREFIX)) {
    const name = cell.slice(NAME_PREFIX.length);
    return levels.filter((level) => level.name.length > 0 && same(level.name, name));
  }
  const id = cell.slice(ID_PREFIX.length);
  if (startsWithIgnoringCase(cell, ID_PREFIX) && GUID.test(id)) {
    return levels.filter((level) => level.id.toUpperCase() === id.toUpperCase());
  }
  const number = cell.startsWith("#") ? readNumber(cell.slice(1)) : null;
  return number === null
    ? []
    : levels.filter((level) => !level.isArchived && level.number === number);
}

/** The levels a legacy Priority cell names, by name or display label ignoring case. */
export function matchCsvPriorityLabel(
  cell: string,
  levels: readonly PriorityLevel[],
): PriorityLevel[] {
  return levels.filter((level) => same(level.name, cell) || same(priorityLabel(level), cell));
}
