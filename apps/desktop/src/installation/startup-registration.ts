/** One operating system's entry that starts the app when the user signs in (§7.13). */
export interface StartupEntry {
  /** Creates or replaces the entry. */
  readonly write: () => Promise<void>;
  /** Deletes the entry if it exists. */
  readonly remove: () => Promise<void>;
}

/** Applies the saved start-with-system choice to this system's entry, when there is one. */
export interface StartupRegistration {
  /** True for an installed build on an operating system that supports the entry. */
  readonly available: boolean;
  /** Writes the entry when enabled, otherwise removes it. False if unavailable or refused. */
  readonly apply: (enabled: boolean) => Promise<boolean>;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Wraps the entry so a refused write is reported, not thrown. The stored
 * preference stays as saved, and App Settings shows the error (§7.13).
 */
export function createStartupRegistration(
  entry: StartupEntry | undefined,
  warn: (message: string) => void,
): StartupRegistration {
  const apply = async (enabled: boolean) => {
    if (entry === undefined) {
      return false;
    }
    try {
      await (enabled ? entry.write() : entry.remove());
      return true;
    } catch (error) {
      warn(`Could not update the start-with-system entry: ${describeError(error)}`);
      return false;
    }
  };
  return { available: entry !== undefined, apply };
}
