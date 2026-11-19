import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { NodeHttpServer } from "@effect/platform-node";
import { RPC_HOST, type RpcConnection, ServerInfo, TaskTrackerRpcs } from "@task-tracker/contracts";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { NetAddress } from "effect/net";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { guardRpcRequest } from "./guard-rpc-request.js";

/** Published after the listener can accept authenticated RPC requests. */
export class LoopbackRpc extends Context.Service<LoopbackRpc, RpcConnection>()(
  "TaskTracker/LoopbackRpc",
) {}

interface LoopbackRpcOptions {
  readonly rendererOrigin: string;
  readonly timeZone: string;
}

/** Starts a scoped HTTP RPC server on an ephemeral IPv4 loopback port. */
export function loopbackRpcLayer(options: LoopbackRpcOptions) {
  return Layer.effect(LoopbackRpc)(
    Effect.gen(function* () {
      const rendererOrigin = yield* validateOrigin(options.rendererOrigin);
      const info = yield* Schema.decodeUnknownEffect(ServerInfo)({ timeZone: options.timeZone });
      const server = yield* HttpServer.HttpServer;
      if (!NetAddress.isInetAddressV4(server.address)) {
        return yield* Effect.fail(new Error("Expected an IPv4 loopback RPC listener."));
      }

      const connection = {
        port: server.address.port,
        credential: randomBytes(32).toString("base64url"),
      };
      const rpc = yield* RpcServer.toHttpEffect(TaskTrackerRpcs).pipe(
        Effect.provide(TaskTrackerRpcs.toLayerHandler("GetServerInfo", () => Effect.succeed(info))),
        Effect.provide(RpcSerialization.layerJson),
      );
      const host = `${RPC_HOST}:${connection.port}`;
      yield* server.serve(
        Effect.interruptible(guardRpcRequest(rpc, { ...connection, host, rendererOrigin })),
      );
      return connection;
    }),
  ).pipe(Layer.provide(NodeHttpServer.layerServer(createServer, { host: RPC_HOST, port: 0 })));
}

function validateOrigin(origin: string) {
  const url = URL.canParse(origin) ? new URL(origin) : undefined;
  if ((url?.protocol === "http:" || url?.protocol === "https:") && url.origin === origin) {
    return Effect.succeed(origin);
  }
  return Effect.fail(new Error("Set the renderer origin to a canonical HTTP or HTTPS origin."));
}
