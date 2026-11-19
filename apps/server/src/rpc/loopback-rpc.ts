import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { NodeHttpServer } from "@effect/platform-node";
import {
  DESKTOP_RENDERER_ORIGIN,
  RPC_HOST,
  type RpcConnection,
  ServerInfo,
  TaskTrackerRpcs,
} from "@task-tracker/contracts";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { NetAddress } from "effect/net";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { guardRpcRequest } from "./guard-rpc-request.js";
import { projectWorkspaceHandlers } from "./project-workspace-handlers.js";
import { itemRpcHandlers } from "./item-rpc-handlers.js";
import { mapOperationError } from "./map-operation-error.js";
import { settingsRpcHandlers } from "./settings-rpc-handlers.js";
import { lookupRpcHandlers } from "./lookup-rpc-handlers.js";
import { fieldRpcHandlers } from "./field-rpc-handlers.js";
import { historyRpcHandlers } from "./history-rpc-handlers.js";
import { trashRpcHandlers } from "./trash-rpc-handlers.js";
import { calendarRpcHandlers } from "./calendar-rpc-handlers.js";
import { searchRpcHandlers } from "./search-rpc-handlers.js";
import { searchQueryRpcHandlers } from "./search-query-rpc-handlers.js";
import { UndoService } from "../services/undo-service.js";

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
        Effect.provide(
          TaskTrackerRpcs.toLayerHandler("GetServerInfo", () =>
            Effect.succeed(info).pipe(mapOperationError),
          ),
        ),
        Effect.provide(projectWorkspaceHandlers(options.timeZone)),
        Effect.provide(RpcSerialization.layerJson),
        Effect.provide(itemRpcHandlers(options.timeZone)),
        Effect.provide(settingsRpcHandlers),
        Effect.provide(lookupRpcHandlers),
        Effect.provide(fieldRpcHandlers),
        Effect.provide(historyRpcHandlers),
        Effect.provide(trashRpcHandlers(options.timeZone)),
        Effect.provide(calendarRpcHandlers(options.timeZone)),
        Effect.provide(searchRpcHandlers),
        Effect.provide(searchQueryRpcHandlers(options.timeZone)),
        Effect.provide(UndoService.layer),
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
  if (origin === DESKTOP_RENDERER_ORIGIN) {
    return Effect.succeed(origin);
  }
  const url = URL.canParse(origin) ? new URL(origin) : undefined;
  if ((url?.protocol === "http:" || url?.protocol === "https:") && url.origin === origin) {
    return Effect.succeed(origin);
  }
  return Effect.fail(
    new Error("Set the renderer origin to the desktop origin or a canonical HTTP or HTTPS origin."),
  );
}
