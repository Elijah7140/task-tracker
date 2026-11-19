import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { launchServer, type ServerProcess, type ServerTimeouts } from "../src/server-process.js";

const origin = "tasktracker://app";
// Generous enough for a loaded machine. Timeout tests shorten only the one they cover.
const timeouts: ServerTimeouts = { readiness: "10 seconds", stop: "10 seconds" };
const credential = "A".repeat(43);

/** Writes a stub server script and launches it the way Electron main launches the real one. */
type Launch = (source: string, overrides?: Partial<ServerTimeouts>) => Promise<ServerProcess>;

const serverTest = test.extend<{ launch: Launch }>({
  launch: async ({ onTestFinished }, use) => {
    const directory = await mkdtemp(join(tmpdir(), "task-tracker-server-process-"));
    onTestFinished(() => rm(directory, { recursive: true, force: true }));
    const started: ServerProcess[] = [];
    onTestFinished(async () => {
      await Promise.all(started.map((server) => server.stop()));
    });
    await use(async (source, overrides) => {
      const entry = join(directory, `stub-${started.length}.mjs`);
      await writeFile(entry, source);
      const server = launchServer(entry, origin, { ...timeouts, ...overrides });
      started.push(server);
      // Tests that only observe the exit leave readiness unawaited.
      server.ready.catch(() => {});
      return server;
    });
  },
});

// Keeps the stub alive until it is killed, ignoring the parent pipe.
const runForever = "setInterval(() => {}, 1000);";
// Behaves like the real server, which exits when the launcher closes stdin.
const exitOnParentPipe = `process.stdin.once("end", () => process.exit(0)).resume();`;

afterEach(() => {
  vi.unstubAllEnvs();
});

serverTest("Resolves the connection from a valid readiness line", async ({ launch }) => {
  const server = await launch(
    `console.log(JSON.stringify({ port: 4321, credential: "${credential}" })); ${exitOnParentPipe}`,
  );

  const connection = await server.ready;

  expect(connection).toEqual({ port: 4321, credential });
});

serverTest("Rejects an invalid readiness line without echoing it", async ({ launch }) => {
  const server = await launch(`console.log("secret-credential-text"); ${exitOnParentPipe}`);

  const failure = server.ready;

  await expect(failure).rejects.toThrow("The server sent an invalid readiness message.");
  await expect(failure).rejects.not.toThrow(/secret-credential-text/);
});

serverTest(
  "Rejects with the server diagnostic when it exits before readiness",
  async ({ launch }) => {
    const server = await launch(`console.error("Unrecognized schema"); process.exit(3);`);

    const failure = server.ready;

    await expect(failure).rejects.toThrow("Unrecognized schema");
  },
);

serverTest("Kills a server that never becomes ready", async ({ launch }) => {
  const server = await launch(runForever, { readiness: "500 millis" });

  const failure = server.ready;

  await expect(failure).rejects.toThrow("Server did not become ready");
  expect(await server.closed).toEqual({ diagnostic: "Server exited (SIGKILL)." });
});

serverTest("Stops gracefully when the server closes on the parent pipe", async ({ launch }) => {
  const server = await launch(
    `process.stdin.once("end", () => { console.error("parent pipe closed"); process.exit(0); }).resume();`,
  );

  await server.stop();

  expect(await server.closed).toEqual({ diagnostic: "parent pipe closed" });
});

serverTest(
  "Kills a server that ignores the parent pipe after the stop timeout",
  async ({ launch }) => {
    const server = await launch(runForever, { stop: "500 millis" });

    await server.stop();

    expect(await server.closed).toEqual({ diagnostic: "Server exited (SIGKILL)." });
  },
);

serverTest("Keeps the newest server output in the crash diagnostic", async ({ launch }) => {
  const server = await launch(
    `process.stderr.write("x".repeat(6000) + "final line", () => process.exit(1));`,
  );

  const { diagnostic } = await server.closed;

  expect(diagnostic).toHaveLength(4000);
  expect(diagnostic.endsWith("final line")).toBe(true);
});

serverTest("Removes Node debugging options from the server environment", async ({ launch }) => {
  vi.stubEnv("NODE_OPTIONS", "--no-deprecation");
  vi.stubEnv("NODE_INSPECT_RESUME_ON_START", "1");
  vi.stubEnv("NODE_DEBUG", "net");
  vi.stubEnv("TASKTRACKER_DB_PATH", "kept.db");
  const server = await launch(
    `const names = ["NODE_OPTIONS", "NODE_INSPECT_RESUME_ON_START", "NODE_DEBUG", "TASKTRACKER_DB_PATH", "ELECTRON_RUN_AS_NODE"];
     console.error(JSON.stringify(names.filter((name) => name in process.env)));
     process.exit(0);`,
  );

  const { diagnostic } = await server.closed;

  expect(JSON.parse(diagnostic)).toEqual(["TASKTRACKER_DB_PATH", "ELECTRON_RUN_AS_NODE"]);
});
