const NUMBER = "(0|[1-9][0-9]*)";
const IDENTIFIER = "(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)";
const SEMVER = new RegExp(
  `^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?(?:\\+[0-9A-Za-z.-]+)?$`,
);

interface ParsedVersion {
  readonly core: readonly [number, number, number];
  readonly prerelease: boolean;
}

function parseVersion(text: string): ParsedVersion | undefined {
  const match = SEMVER.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, major = "", minor = "", patch = "", prerelease] = match;
  return {
    core: [Number(major), Number(minor), Number(patch)],
    prerelease: prerelease !== undefined,
  };
}

function compareCore(left: ParsedVersion["core"], right: ParsedVersion["core"]) {
  for (let index = 0; index < left.length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * Whether a feed version is a stable release newer than the running build (§7.13).
 * Prereleases are never offered. A stable release supersedes a prerelease of the
 * same number. Unparseable versions are never newer.
 */
export function isNewerStableRelease(candidate: string, current: string): boolean {
  const offered = parseVersion(candidate);
  const running = parseVersion(current);
  if (offered === undefined || running === undefined || offered.prerelease) {
    return false;
  }
  const difference = compareCore(offered.core, running.core);
  return difference > 0 || (difference === 0 && running.prerelease);
}
