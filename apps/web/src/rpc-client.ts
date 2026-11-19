import { RpcConnection, rpcUrl, TaskTrackerRpcs } from "@task-tracker/contracts";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

const browserHttp = (credential: string) =>
  Layer.effect(HttpClient.HttpClient)(
    Effect.map(HttpClient.HttpClient, HttpClient.filterStatusOk),
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

/** Creates a scoped renderer client from the current launch's connection details. */
export const makeRpcClient = Effect.fnUntraced(function* (connection: RpcConnection) {
  const validated = yield* Schema.decodeUnknownEffect(RpcConnection)(connection);
  const protocol = RpcClient.layerProtocolHttp({ url: rpcUrl(validated) }).pipe(
    Layer.provide(browserHttp(validated.credential)),
    Layer.provide(RpcSerialization.layerJson),
  );

  return yield* RpcClient.make(TaskTrackerRpcs).pipe(Effect.provide(protocol));
});
