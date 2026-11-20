const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function parseAddress(address: string) {
  try {
    return new URL(address);
  } catch {
    return undefined;
  }
}

function isAllowedUrl(url: URL) {
  if (url.username !== "" || url.password !== "") {
    return false;
  }
  return (
    url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
  );
}

/**
 * Update requests use HTTPS. Plain HTTP is allowed only on the loopback interface,
 * for a local test feed. Addresses that carry credentials are refused.
 */
export function isAllowedUpdateAddress(address: string): boolean {
  const url = parseAddress(address);
  return url !== undefined && isAllowedUrl(url);
}

/**
 * The folder that holds the release metadata and installers (§7.13). The
 * `TASKTRACKER_UPDATE_FEED_URL` environment value replaces the feed the build
 * was packaged with. Without a usable feed, checks report it as unavailable.
 */
export function resolveUpdateFeed(
  environment: string | undefined,
  built: string | undefined,
): URL | undefined {
  const configured = environment !== undefined && environment !== "" ? environment : built;
  const url = configured === undefined ? undefined : parseAddress(configured);
  if (url === undefined || !isAllowedUrl(url)) {
    return undefined;
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}
