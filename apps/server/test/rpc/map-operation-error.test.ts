import { expect, it } from "@effect/vitest";
import { RpcOperationError } from "@task-tracker/contracts";
import { Effect } from "effect";
import { FetchHttpClient, HttpEffect } from "effect/http";
import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer } from "effect/rpc";
import { mapOperationError } from "../../src/rpc/map-operation-error.js";

const rpcs = RpcGroup.make(Rpc.make("Die", { error: RpcOperationError }));

it.effect("Returns a generic operation failure when an RPC handler dies", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const http = yield* RpcServer.toHttpEffect(rpcs).pipe(
        Effect.provide(
          rpcs.toLayer({
            Die: () => Effect.die(new Error("Private diagnostic")).pipe(mapOperationError),
          }),
        ),
      );
      const handle = HttpEffect.toWebHandler(http);
      const client = yield* RpcClient.make(rpcs).pipe(
        Effect.provide(RpcClient.layerProtocolHttp({ url: "http://localhost/rpc" })),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, (input, init) =>
          handle(new Request(input, init)),
        ),
      );

      const failure = yield* Effect.flip(client.Die());

      expect(failure).toMatchObject({
        _tag: "OperationFailed",
        message: "The operation could not be completed.",
      });
    }),
  ).pipe(Effect.provide(RpcSerialization.layerJson)),
);
