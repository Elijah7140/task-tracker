import { describe, expect, it } from "vitest";
import { readRpcConnection, withoutRpcConnection } from "../../src/rpc/rpc-connection-source.js";

const credential = "A".repeat(43);

describe("readRpcConnection", () => {
  it("Reads the port and credential from the launch query", () => {
    const search = `?rpcPort=49152&rpcCredential=${credential}`;

    const connection = readRpcConnection(search);

    expect(connection).toEqual({ port: 49152, credential });
  });

  it("Rejects a launch query without a credential", () => {
    const connection = readRpcConnection("?rpcPort=49152");

    expect(connection).toBeUndefined();
  });

  it("Rejects a malformed port", () => {
    const search = `?rpcPort=port&rpcCredential=${credential}`;

    const connection = readRpcConnection(search);

    expect(connection).toBeUndefined();
  });
});

describe("withoutRpcConnection", () => {
  it("Removes the connection parameters and keeps the rest of the address", () => {
    const href = `file:///app/index.html?rpcPort=1&rpcCredential=${credential}&lang=en#/projects`;

    const cleaned = withoutRpcConnection(href);

    expect(cleaned).toBe("file:///app/index.html?lang=en#/projects");
  });
});
