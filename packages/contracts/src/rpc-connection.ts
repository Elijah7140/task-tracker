import { Schema } from "effect";

/** The only network interface on which the RPC server listens. */
export const RPC_HOST = "127.0.0.1";

/** The HTTP RPC route. */
export const RPC_PATH = "/rpc/";

/** Connection details handed from the server to the renderer at startup. */
export const RpcConnection = Schema.Struct({
  port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 })),
  credential: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
});

/** Validated connection details for one server launch. */
export type RpcConnection = typeof RpcConnection.Type;

/** Builds the endpoint from the assigned port and the fixed loopback interface. */
export const rpcUrl = (connection: RpcConnection) =>
  `http://${RPC_HOST}:${connection.port}${RPC_PATH}`;
