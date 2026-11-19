import { createMemoryHistory } from "@tanstack/react-router";
import type { Clock } from "effect";
import { onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { AppRoot } from "../../src/app/app-root.js";
import { rpcProtocolLayer } from "../../src/rpc-client.js";
import { FakeProjectStore, type SeedProject, startFakeServer } from "./fake-task-tracker-server.js";

const TEST_CONNECTION = { port: 49152, credential: "T".repeat(43) };

/** Options for {@link renderApp}. */
export interface RenderAppOptions {
  readonly projects?: ReadonlyArray<SeedProject>;
  readonly path?: string;
  /** A clock for renderer timers, such as a `TestClock` from {@link createTestClock}. */
  readonly clock?: Clock.Clock;
}

/**
 * Mounts the whole renderer with memory routing and the real RPC client wired
 * to an in-process fake server.
 */
export async function renderApp({ projects = [], path = "/", clock }: RenderAppOptions = {}) {
  const store = new FakeProjectStore(projects);
  const server = await startFakeServer(store);
  onTestFinished(() => server.close());
  const history = createMemoryHistory({ initialEntries: [path] });
  const protocol = rpcProtocolLayer(TEST_CONNECTION, { fetch: server.fetch });

  const screen = await render(<AppRoot protocol={protocol} history={history} clock={clock} />);

  return { screen, store, history };
}
