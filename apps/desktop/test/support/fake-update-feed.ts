import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

/** What the fake feed answers for one path. */
export interface FakeFeedResponse {
  readonly status?: number;
  readonly body?: string | Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
}

/** A request the fake feed received. */
export interface FakeFeedRequest {
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
}

/** A local release feed on the loopback interface, so tests make no real network requests. */
export interface FakeUpdateFeed {
  /** The feed folder, ending in a slash. */
  readonly url: string;
  readonly requests: FakeFeedRequest[];
  /** Answers `name` (a file in the feed folder) with `response` from now on. */
  readonly serve: (name: string, response: FakeFeedResponse) => void;
  readonly close: () => Promise<void>;
}

const FEED_PATH = "/feed/";

/** Starts a fake feed. Unknown paths answer 404, like a missing release asset. */
export async function startFakeUpdateFeed(): Promise<FakeUpdateFeed> {
  const responses = new Map<string, FakeFeedResponse>();
  const requests: FakeFeedRequest[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "";
    requests.push({ path, headers: request.headers });
    const answer = responses.get(path) ?? { status: 404, body: "Not Found" };
    response.writeHead(answer.status ?? 200, answer.headers);
    response.end(answer.body ?? "");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${FEED_PATH}`,
    requests,
    serve: (name, response) => responses.set(`${FEED_PATH}${name}`, response),
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

/** The base64 SHA-512 electron-builder records for a file. */
export function sha512Of(payload: string | Uint8Array) {
  return createHash("sha512").update(payload).digest("base64");
}

/** Stable-channel metadata for one release file, as electron-builder writes it. */
export function releaseMetadata(version: string, fileName: string, payload: string | Uint8Array) {
  const sha512 = sha512Of(payload);
  const size = Buffer.byteLength(payload);
  return [
    `version: ${version}`,
    "files:",
    `  - url: ${fileName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${fileName}`,
    `sha512: ${sha512}`,
    "releaseDate: '2026-11-18T20:00:00.000Z'",
    "",
  ].join("\n");
}
