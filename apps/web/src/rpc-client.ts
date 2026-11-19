import { RpcConnection, rpcUrl, TaskTrackerRpcs } from "@task-tracker/contracts";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

/** Transport overrides for tests that serve RPC in-process instead of over loopback. */
export interface RpcTransportOptions {
  readonly fetch?: typeof globalThis.fetch | undefined;
}

const withFetch = (fetch: typeof globalThis.fetch | undefined) => (client: HttpClient.HttpClient) =>
  fetch === undefined
    ? client
    : HttpClient.transform(client, (response) =>
        Effect.provideService(response, FetchHttpClient.Fetch, fetch),
      );

const browserHttp = (credential: string, options?: RpcTransportOptions) =>
  Layer.effect(HttpClient.HttpClient)(
    Effect.map(HttpClient.HttpClient, (client) =>
      withFetch(options?.fetch)(HttpClient.filterStatusOk(client)),
    ),
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    // Apply the credential at fetch time so it stays out of Effect request diagnostics.
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, {
        credentials: "omit",
        headers: { Authorization: `Bearer ${credential}` },
        redirect: "error",
      }),
    ),
    Layer.provide(Layer.succeed(HttpClient.TracerPropagationEnabled, false)),
  );

const protocolFor = (connection: RpcConnection, options?: RpcTransportOptions) =>
  RpcClient.layerProtocolHttp({ url: rpcUrl(connection) }).pipe(
    Layer.provide(browserHttp(connection.credential, options)),
    Layer.provide(RpcSerialization.layerJson),
  );

/** Creates a scoped renderer client from the current launch's connection details. */
export const makeRpcClient = Effect.fnUntraced(function* (connection: RpcConnection) {
  const validated = yield* Schema.decodeUnknownEffect(RpcConnection)(connection);

  return yield* RpcClient.make(TaskTrackerRpcs).pipe(Effect.provide(protocolFor(validated)));
});

/**
 * Builds the renderer's HTTP RPC protocol for one launch. The atom RPC client
 * (`TaskTrackerClient`) runs every query and mutation over this layer.
 */
export const rpcProtocolLayer = (connection: RpcConnection, options?: RpcTransportOptions) =>
  Layer.unwrap(
    Effect.map(Schema.decodeUnknownEffect(RpcConnection)(connection), (validated) =>
      protocolFor(validated, options),
    ),
  );
