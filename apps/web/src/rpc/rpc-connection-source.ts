import { RpcConnection } from "@task-tracker/contracts";
import { Option, Schema } from "effect";

/** Launch query parameter carrying the RPC port. */
export const RPC_PORT_PARAM = "rpcPort";

/** Launch query parameter carrying the per-launch RPC credential. */
export const RPC_CREDENTIAL_PARAM = "rpcCredential";

const decodeConnection = Schema.decodeUnknownOption(RpcConnection);

/**
 * Reads one launch's connection details from the page query, for example
 * `index.html?rpcPort=49152&rpcCredential=…#/`. The router uses the hash.
 */
export function readRpcConnection(search: string): RpcConnection | undefined {
  const params = new URLSearchParams(search);
  const port = params.get(RPC_PORT_PARAM);
  const credential = params.get(RPC_CREDENTIAL_PARAM);
  if (port === null || credential === null || !/^\d+$/.test(port)) {
    return undefined;
  }
  return Option.getOrUndefined(decodeConnection({ port: Number(port), credential }));
}

/** Returns the address with the connection parameters removed. */
export function withoutRpcConnection(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(RPC_PORT_PARAM);
  url.searchParams.delete(RPC_CREDENTIAL_PARAM);
  return url.href;
}

/**
 * Reads the connection details and removes them from the address bar and
 * session history so the credential is not kept in the page URL.
 */
export function takeRpcConnection(location: Location, history: History) {
  const connection = readRpcConnection(location.search);
  if (connection !== undefined) {
    history.replaceState(history.state, "", withoutRpcConnection(location.href));
  }
  return connection;
}
