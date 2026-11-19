import { request as nodeRequest, type IncomingMessage } from "node:http";
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { rpcUrl } from "@task-tracker/contracts";
import { makeRpcClient } from "../../../web/src/rpc-client.js";
import { sqliteLayer } from "../../src/db/sqlite.js";
import { LoopbackRpc, loopbackRpcLayer } from "../../src/rpc/loopback-rpc.js";

const rendererOrigin = "http://127.0.0.1:5173";
const timeZone = "America/New_York";
const testRpcLayer = (origin: string) =>
  loopbackRpcLayer({ rendererOrigin: origin, timeZone }).pipe(
    Layer.provide(sqliteLayer(":memory:")),
  );
const withRpc = Effect.provide(testRpcLayer(rendererOrigin));

// A browser supplies Origin itself. Node fetch needs it on the real request in this test.
const rendererFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", rendererOrigin);
  return fetch(input, { ...init, headers });
};

it.effect("Serves the server's IANA time zone through the web client as soon as it is ready", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const connection = yield* LoopbackRpc;
      const endpoint = new URL(rpcUrl(connection));
      const client = yield* makeRpcClient(connection);

      const info = yield* client.GetServerInfo();

      expect(endpoint.hostname).toBe("127.0.0.1");
      expect(Number(endpoint.port)).toBeGreaterThan(0);
      expect(info).toEqual({ timeZone: "America/New_York" });
    }).pipe(Effect.provideService(FetchHttpClient.Fetch, rendererFetch)),
  ).pipe(withRpc),
);

const httpRequest = (url: string, init: RequestInit) =>
  Effect.tryPromise(() => fetch(url, { ...init, redirect: "error" }));

it.effect("Allows browser preflight for the configured renderer", () =>
  Effect.gen(function* () {
    const connection = yield* LoopbackRpc;

    const response = yield* httpRequest(rpcUrl(connection), {
      method: "OPTIONS",
      headers: {
        Origin: rendererOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(rendererOrigin);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "authorization, content-type",
    );
  }).pipe(withRpc),
);

it.effect.each([undefined, "null", "http://127.0.0.1:5174", "https://example.com"])(
  "Denies RPC and preflight from origin %s",
  (origin) =>
    Effect.gen(function* () {
      const connection = yield* LoopbackRpc;
      const headers = new Headers({ Authorization: `Bearer ${connection.credential}` });
      if (origin !== undefined) {
        headers.set("Origin", origin);
      }

      const response = yield* httpRequest(rpcUrl(connection), { method: "POST", headers });
      const preflight = yield* httpRequest(rpcUrl(connection), {
        method: "OPTIONS",
        headers: { ...Object.fromEntries(headers), "Access-Control-Request-Method": "POST" },
      });

      expect(response.status).toBe(403);
      expect(preflight.status).toBe(403);
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
      expect(preflight.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }).pipe(withRpc),
);

it.effect.each([undefined, "Bearer incorrect"])(
  "Denies an RPC from the configured renderer with authorization %s",
  (authorization) =>
    Effect.gen(function* () {
      const connection = yield* LoopbackRpc;
      const headers = new Headers({ Origin: rendererOrigin });
      if (authorization !== undefined) {
        headers.set("Authorization", authorization);
      }

      const response = yield* httpRequest(rpcUrl(connection), { method: "POST", headers });

      expect(response.status).toBe(401);
    }).pipe(withRpc),
);

it.effect(
  "Issues a fresh credential on each launch and rejects a previous launch's credential",
  () =>
    Effect.gen(function* () {
      const previous = yield* LoopbackRpc.pipe(Effect.provide(testRpcLayer(rendererOrigin)));
      const current = yield* LoopbackRpc;

      const response = yield* httpRequest(rpcUrl(current), {
        method: "POST",
        headers: { Origin: rendererOrigin, Authorization: `Bearer ${previous.credential}` },
      });

      expect(current.credential === previous.credential).toBe(false);
      expect(response.status).toBe(401);
    }).pipe(withRpc),
);

it.effect("Rejects an unexpected Host even with the renderer origin and launch credential", () =>
  Effect.gen(function* () {
    const connection = yield* LoopbackRpc;

    // Fetch derives Host from the URL, so send the authority with Node HTTP.
    const response = yield* Effect.tryPromise(
      (signal) =>
        new Promise<IncomingMessage>((resolve, reject) => {
          const request = nodeRequest(
            rpcUrl(connection),
            {
              method: "POST",
              signal,
              headers: {
                Host: "unexpected.example",
                Origin: rendererOrigin,
                Authorization: `Bearer ${connection.credential}`,
              },
            },
            (response) => {
              response.resume();
              resolve(response);
            },
          );
          request.once("error", reject);
          request.end();
        }),
    );

    expect(response.statusCode).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  }).pipe(withRpc),
);

it.effect("Closes the listener when its scope ends", () =>
  Effect.gen(function* () {
    const connection = yield* Effect.scoped(LoopbackRpc.pipe(withRpc));

    const request = yield* httpRequest(rpcUrl(connection), { method: "POST" }).pipe(Effect.result);

    expect(request._tag).toBe("Failure");
  }),
);

it.effect.each(["*", "null", `${rendererOrigin}/`])(
  "Rejects an invalid renderer origin configuration of %s",
  (origin) =>
    Effect.gen(function* () {
      const server = testRpcLayer(origin);

      const startup = yield* LoopbackRpc.pipe(Effect.provide(server), Effect.result);

      expect(startup._tag).toBe("Failure");
    }),
);
