const UNKNOWN_VERSION = "unknown";

/** A version made only of the characters semantic versions use. */
const VERSION_TEXT = /^[0-9A-Za-z.-]+$/;

/**
 * The version the About line shows (§7.13): the package version without its
 * `+build` metadata, keeping any pre-release label. Anything unusable reads
 * as "unknown".
 */
export function displayVersion(packageVersion: string | undefined): string {
  const [withoutMetadata = ""] = (packageVersion ?? "").split("+");
  return VERSION_TEXT.test(withoutMetadata) ? withoutMetadata : UNKNOWN_VERSION;
}
