import { describe, expect, it } from "vitest";
import { readRpcConnection } from "../../src/rpc/rpc-connection-source.js";

const credential = "A".repeat(43);

describe("readRpcConnection", () => {
  it("Reads the port and credential from the desktop bridge", async () => {
    const bridge = { getRpcConnection: async () => ({ port: 49152, credential }) };

    const connection = await readRpcConnection(bridge);

    expect(connection).toEqual({ port: 49152, credential });
  });

  it("Allows the browser to load without a desktop bridge", async () => {
    const connection = await readRpcConnection(undefined);

    expect(connection).toBeUndefined();
  });

  it("Rejects malformed connection details", async () => {
    const bridge = { getRpcConnection: async () => ({ port: 65536, credential }) };

    const connection = await readRpcConnection(bridge);

    expect(connection).toBeUndefined();
  });
});
