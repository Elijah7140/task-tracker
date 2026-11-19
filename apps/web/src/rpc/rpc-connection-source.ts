import { RpcConnection } from "@task-tracker/contracts";
import { Option, Schema } from "effect";

interface DesktopBridge {
  getRpcConnection(): Promise<unknown>;
}

declare global {
  interface Window {
    readonly taskTrackerDesktop?: DesktopBridge;
  }
}

const decodeConnection = Schema.decodeUnknownOption(RpcConnection);

/** Validates the current launch's connection details from the isolated preload. */
export async function readRpcConnection(bridge: DesktopBridge | undefined) {
  return Option.getOrUndefined(decodeConnection(await bridge?.getRpcConnection()));
}
