import { Duration } from "effect";
import { describe, expect, it } from "vitest";
import { createQuitCoordinator } from "../src/quit-coordinator.js";
import type { ServerProcess, ServerStop } from "../src/server-process.js";

const stopped: ServerStop = { duration: Duration.millis(5), killed: false };

/** A coordinator over a fake server whose stop resolves when the test says so. */
function setup() {
  const calls: string[] = [];
  let finishStop: (stop: ServerStop) => void = () => undefined;
  const child = {
    stop: () => {
      calls.push("stop server");
      return new Promise<ServerStop>((resolve) => {
        finishStop = resolve;
      });
    },
    closed: Promise.resolve({ diagnostic: "" }),
  } as unknown as ServerProcess;
  let server: ServerProcess | undefined = child;
  const coordinator = createQuitCoordinator({
    server: () => server,
    onServerStopped: () => {
      calls.push("server stopped");
      server = undefined;
    },
    onQuit: () => calls.push("quit goes ahead"),
    quit: () => {
      calls.push("ask to quit");
      coordinator.beforeQuit(quitEvent(calls));
    },
    showWindow: () => calls.push("show window"),
    relaunchAfterQuit: () => calls.push("relaunch after quit"),
  });
  const stopServer = async () => {
    finishStop(stopped);
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { calls, coordinator, stopServer };
}

function quitEvent(calls: string[]) {
  return { preventDefault: () => calls.push("hold quit") };
}

describe("createQuitCoordinator", () => {
  it("Holds the quit until the server has stopped, then lets it go ahead", async () => {
    const { calls, coordinator, stopServer } = setup();

    coordinator.beforeQuit(quitEvent(calls));
    const held = [...calls];
    await stopServer();

    expect(held).toEqual(["hold quit", "stop server"]);
    expect(calls.slice(2)).toEqual(["server stopped", "ask to quit", "quit goes ahead"]);
    expect(coordinator.quitting()).toBe(true);
  });

  it("Stops the server once when a second quit arrives during the first", () => {
    const { calls, coordinator } = setup();

    coordinator.beforeQuit(quitEvent(calls));
    coordinator.beforeQuit(quitEvent(calls));

    expect(calls).toEqual(["hold quit", "stop server", "hold quit"]);
  });

  it("Stops the server when the OS session ends", async () => {
    const { calls, coordinator, stopServer } = setup();

    coordinator.endSession();
    const quitting = coordinator.quitting();
    await stopServer();

    expect(quitting).toBe(true);
    expect(calls).toEqual([
      "ask to quit",
      "hold quit",
      "stop server",
      "server stopped",
      "ask to quit",
      "quit goes ahead",
    ]);
  });

  it("Shows the window for a second launch while the app keeps running", () => {
    const { calls, coordinator } = setup();

    coordinator.onSecondInstance();

    expect(calls).toEqual(["show window"]);
    expect(coordinator.quitting()).toBe(false);
  });

  it("Relaunches once for launches that arrive while the app is quitting", () => {
    const { calls, coordinator } = setup();
    coordinator.beforeQuit(quitEvent(calls));

    coordinator.onSecondInstance();
    coordinator.onSecondInstance();

    expect(calls.slice(2)).toEqual(["relaunch after quit"]);
  });
});
