import { nameKey, trimMetadataText } from "../metadata/names.js";

function shorten(name: string, length: number): string {
  return name.length <= length ? name : name.slice(0, length).replace(/\p{White_Space}+$/u, "");
}

/**
 * Returns the trimmed name when it is free, otherwise the first free variant with
 * " (imported)", " (imported 2)" and so on, shortened to fit `maxLength` (§7.9).
 */
export function uniqueImportedName(
  name: string,
  isTaken: (candidate: string) => boolean,
  maxLength: number,
): string {
  const trimmed = trimMetadataText(name);
  if (!isTaken(trimmed)) {
    return trimmed;
  }
  for (let attempt = 1; ; attempt++) {
    const suffix = attempt === 1 ? " (imported)" : ` (imported ${attempt})`;
    const candidate = shorten(trimmed, maxLength - suffix.length) + suffix;
    if (!isTaken(candidate)) {
      return candidate;
    }
  }
}

/** The names already in use, ignoring case; hands out a free variant of each imported name. */
export class TakenNames {
  readonly #keys: Set<string>;

  constructor(
    existing: Iterable<string>,
    private readonly maxLength: number,
  ) {
    this.#keys = new Set(Array.from(existing, nameKey));
  }

  /** Returns the name when free, otherwise a suffixed one, and reserves the result. */
  reserve(name: string): string {
    const unique = uniqueImportedName(
      name,
      (candidate) => this.#keys.has(nameKey(candidate)),
      this.maxLength,
    );
    this.#keys.add(nameKey(unique));
    return unique;
  }
}
