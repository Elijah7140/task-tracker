import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
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
import { savedSearchRpcHandlers } from "./saved-search-rpc-handlers.js";
import { todayRpcHandlers } from "./today-rpc-handlers.js";
import { reminderRpcHandlers } from "./reminder-rpc-handlers.js";
import { ticketRpcHandlers } from "./ticket-rpc-handlers.js";
import { ticketListRpcHandlers } from "./ticket-list-rpc-handlers.js";
import { inProgressRpcHandlers } from "./in-progress-rpc-handlers.js";
import { UndoService } from "../services/undo-service.js";
import { DatabaseBackup } from "../services/transfer/database-backup.js";
import { TransferFileGrants } from "../services/transfer/transfer-file-grants.js";
import { transferRpcHandlers } from "./transfer-rpc-handlers.js";
import { desktopBridgeLayer } from "../desktop/desktop-bridge.js";
import { ParentChannel } from "../desktop/parent-channel.js";
import { parentReminderNotifierLayer } from "../desktop/parent-reminder-notifier.js";

/** Published after the listener can accept authenticated RPC requests. */
export class LoopbackRpc extends Context.Service<LoopbackRpc, RpcConnection>()(
  "TaskTracker/LoopbackRpc",
) {}

interface LoopbackRpcOptions {
  readonly rendererOrigin: string;
  readonly timeZone: string;
  /**
   * The file grants from Electron main and the pre-import backup (§7.9). Without
   * them no file is granted and imports cannot back up, so they refuse.
   */
  readonly transfer?: Layer.Layer<TransferFileGrants | DatabaseBackup>;
  /** The pipes to Electron main. Without them reminders only log their notifications. */
  readonly parent?: ParentChannel["Service"];
}

/**
 * Session services live as long as the listener: the history and the reminder
 * scheduler. Under Electron, main shows the notifications and triggers checks.
 */
function sessionLayer(timeZone: string, parent: ParentChannel["Service"] | undefined) {
  if (parent === undefined) {
    return reminderRpcHandlers(timeZone).pipe(Layer.provideMerge(UndoService.layer));
  }
  const session = reminderRpcHandlers(timeZone, parentReminderNotifierLayer).pipe(
    Layer.provideMerge(UndoService.layer),
  );
  return desktopBridgeLayer.pipe(
    Layer.provideMerge(session),
    Layer.provide(Layer.succeed(ParentChannel)(parent)),
  );
}

const noTransferFiles = Layer.merge(TransferFileGrants.layer, DatabaseBackup.layer(null));

/** Starts a scoped HTTP RPC server on an ephemeral IPv4 loopback port. */
export function loopbackRpcLayer(options: LoopbackRpcOptions) {
  return Layer.unwrap(
    Effect.sync(() => {
      const listener = createServer();
      return Layer.effect(LoopbackRpc)(serveRpc(options, listener)).pipe(
        Layer.provide(NodeHttpServer.layerServer(() => listener, listenOptions)),
      );
    }),
  );
}

/** Serves the RPC handlers on `listener` and publishes the connection details. */
function serveRpc(options: LoopbackRpcOptions, listener: Server) {
  return Effect.gen(function* () {
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
    const rpc = yield* makeRpcApp(options, info);
    const host = `${RPC_HOST}:${connection.port}`;
    // Added before serving, so it runs after the open requests have been interrupted.
    yield* Effect.addFinalizer(() => Effect.sync(() => closeConnections(listener)));
    yield* server.serve(
      Effect.interruptible(guardRpcRequest(rpc, { ...connection, host, rendererOrigin })),
    );
    return connection;
  });
}

/**
 * Builds the RPC HTTP app and the services it shares for the listener's lifetime:
 * the session and the transfer files.
 */
function makeRpcApp(options: LoopbackRpcOptions, info: typeof ServerInfo.Type) {
  return Effect.gen(function* () {
    const session = yield* Layer.build(sessionLayer(options.timeZone, options.parent));
    // Built for the listener's lifetime, so a stdin grant listener keeps running.
    const transferFiles = yield* Layer.build(options.transfer ?? noTransferFiles);
    return yield* RpcServer.toHttpEffect(TaskTrackerRpcs).pipe(
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
      Effect.provide(savedSearchRpcHandlers),
      Effect.provide(todayRpcHandlers(options.timeZone)),
      Effect.provide(ticketRpcHandlers),
      Effect.provide(ticketListRpcHandlers),
      Effect.provide(transferRpcHandlers),
      Effect.provide(inProgressRpcHandlers(options.timeZone)),
      Effect.provide(transferFiles),
      // One session layer supplies the shared UndoService to every handler above.
      Effect.provide(session),
    );
  });
}

/**
 * Stops listening and destroys every remaining connection. Chromium opens spare
 * connections that may never carry a request. Node 24, which Electron embeds,
 * counts such a connection as active until its 60-second header timeout, so
 * `close` alone would wait for it and Electron main would kill the server before
 * it closed the database. A request that arrives once the handler is removed
 * would also never be answered. Every request has already been interrupted here.
 */
function closeConnections(listener: Server) {
  listener.close();
  listener.closeAllConnections();
}

/**
 * The renderer always holds a `WatchReminders` request open. A graceful shutdown would
 * wait for it, so Electron main killed the server instead of letting it close the
 * database. Stopping interrupts open requests at once; an interrupted write rolls back.
 */
const listenOptions = { host: RPC_HOST, port: 0, disablePreemptiveShutdown: true };

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
