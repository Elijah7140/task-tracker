import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Option } from "effect";
import { isNewerStableRelease } from "./release-version.js";
import { isAllowedUpdateAddress } from "./update-feed.js";
import {
  installerFor,
  metadataFileName,
  parseUpdateMetadata,
  type UpdateFile,
} from "./update-metadata.js";

/** The HTTP client the updater uses: Electron's `net.fetch` in main, or `fetch` in tests. */
export type FetchUpdate = (
  address: string,
  init: { readonly signal: AbortSignal; readonly redirect: "follow" },
) => Promise<Response>;

/** A newer release found on the feed: its version, installer and download address. */
export interface UpdateCandidate {
  readonly version: string;
  readonly file: UpdateFile;
  readonly address: string;
}

/** What a feed check found, before the renderer turns it into a message. */
export type FeedCheck =
  | { readonly outcome: "up-to-date" }
  | { readonly outcome: "available"; readonly candidate: UpdateCandidate }
  | { readonly outcome: "feed-unavailable" }
  | { readonly outcome: "failed" };

/** Release metadata is a few hundred bytes. Longer answers are not metadata. */
const METADATA_LIMIT = 65_536;
const CHECK_TIMEOUT = "30 seconds";
const DOWNLOAD_TIMEOUT = "30 minutes";

/** A missing or private release answers like this (§7.13). */
const FEED_UNAVAILABLE_STATUSES = new Set([401, 404]);

class FeedAnswer extends Error {
  constructor(readonly status: number) {
    super(`The update feed answered ${status}.`);
  }
}

/** Requests `address`, refusing an answer that redirected away from an allowed address. */
async function request(fetchUpdate: FetchUpdate, address: string, signal: AbortSignal) {
  const response = await fetchUpdate(address, { signal, redirect: "follow" });
  if (response.url !== "" && !isAllowedUpdateAddress(response.url)) {
    await response.body?.cancel();
    throw new Error("The update feed redirected to an address that is not allowed.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new FeedAnswer(response.status);
  }
  return response;
}

/** Reads the body's chunks in order, stopping with an error once `limit` bytes pass. */
async function* chunksOf(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return;
  }
  let total = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    total += chunk.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("The update feed sent more data than expected.");
    }
    yield chunk.value;
  }
}

async function readMetadataText(response: Response) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of chunksOf(response, METADATA_LIMIT)) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function classifyFailure(error: unknown): FeedCheck {
  const unavailable = error instanceof FeedAnswer && FEED_UNAVAILABLE_STATUSES.has(error.status);
  return { outcome: unavailable ? "feed-unavailable" : "failed" };
}

function offerFrom(text: string, metadataAddress: string, options: CheckOptions): FeedCheck {
  const metadata = parseUpdateMetadata(text);
  const file = metadata === undefined ? undefined : installerFor(metadata, options.platform);
  if (metadata === undefined || file === undefined) {
    return { outcome: "failed" };
  }
  if (!isNewerStableRelease(metadata.version, options.currentVersion)) {
    return { outcome: "up-to-date" };
  }
  const address = new URL(file.url, metadataAddress).href;
  return { outcome: "available", candidate: { version: metadata.version, file, address } };
}

/** What a feed check needs. */
export interface CheckOptions {
  readonly fetch: FetchUpdate;
  readonly feed: URL;
  readonly platform: NodeJS.Platform;
  readonly currentVersion: string;
}

/**
 * Reads the stable channel's metadata from the feed and offers its installer
 * when it is a newer stable release (§7.13). Failures become outcomes and are
 * never thrown. Requests carry no credentials.
 */
export function checkFeed(options: CheckOptions): Effect.Effect<FeedCheck> {
  const name = metadataFileName(options.platform);
  if (name === undefined) {
    return Effect.succeed({ outcome: "failed" });
  }
  const address = new URL(name, options.feed).href;
  return Effect.tryPromise({
    try: async (signal) => readMetadataText(await request(options.fetch, address, signal)),
    catch: (error) => error,
  }).pipe(
    Effect.timeoutOption(CHECK_TIMEOUT),
    Effect.map((text) =>
      Option.match(text, {
        onNone: (): FeedCheck => ({ outcome: "failed" }),
        onSome: (body) => offerFrom(body, address, options),
      }),
    ),
    Effect.catch((error) => Effect.succeed(classifyFailure(error))),
  );
}

/** Streams the body to `path`, hashing as it goes, and returns the SHA-512 and size. */
async function writeAndHash(response: Response, path: string, limit: number) {
  const hash = createHash("sha512");
  const handle = await open(path, "wx", 0o600);
  let size = 0;
  try {
    for await (const chunk of chunksOf(response, limit)) {
      hash.update(chunk);
      size += chunk.byteLength;
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  return { sha512: hash.digest("base64"), size };
}

async function downloadVerified(
  options: DownloadOptions,
  signal: AbortSignal,
): Promise<string | undefined> {
  const { candidate, directory } = options;
  const target = join(directory, candidate.file.url);
  const partial = `${target}.partial`;
  await rm(partial, { force: true });
  try {
    const response = await request(options.fetch, candidate.address, signal);
    const written = await writeAndHash(response, partial, candidate.file.size);
    if (written.size !== candidate.file.size || written.sha512 !== candidate.file.sha512) {
      return undefined;
    }
    await rename(partial, target);
    return target;
  } finally {
    await rm(partial, { force: true });
  }
}

/** What a download needs. */
export interface DownloadOptions {
  readonly fetch: FetchUpdate;
  readonly candidate: UpdateCandidate;
  /** The updater's own folder. The verified file is kept here under its release name. */
  readonly directory: string;
}

/**
 * Downloads the candidate's installer and keeps it only when its size and SHA-512
 * match the release metadata. Anything else is deleted and yields undefined, so an
 * unverified file is never offered for installation.
 */
export function downloadCandidate(options: DownloadOptions): Effect.Effect<string | undefined> {
  return Effect.tryPromise({
    try: (signal) => downloadVerified(options, signal),
    catch: (error) => error,
  }).pipe(
    Effect.timeoutOption(DOWNLOAD_TIMEOUT),
    Effect.map(Option.getOrUndefined),
    Effect.catch(() => Effect.succeed(undefined)),
  );
}

async function hashFile(path: string) {
  const hash = createHash("sha512");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    hash.update(bytes);
    size += bytes.byteLength;
  }
  return { sha512: hash.digest("base64"), size };
}

/** Whether the file at `path` still has the expected SHA-512 and size, as before installing it. */
export function fileMatches(
  path: string,
  expected: Pick<UpdateFile, "sha512" | "size">,
): Effect.Effect<boolean> {
  return Effect.tryPromise(() => hashFile(path)).pipe(
    Effect.map(({ sha512, size }) => sha512 === expected.sha512 && size === expected.size),
    Effect.catch(() => Effect.succeed(false)),
  );
}
