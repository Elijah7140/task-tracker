import { onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { rpcProtocolLayer } from "../../src/rpc-client.js";
import { TrayCardRoot } from "../../src/tray-card/tray-card-root.js";
import { FakeProjectStore, type SeedProject, startFakeServer } from "./fake-task-tracker-server.js";

const TEST_CONNECTION = { port: 49152, credential: "T".repeat(43) };

/** Options for {@link renderTrayCard}. */
export interface RenderTrayCardOptions {
  readonly projects?: ReadonlyArray<SeedProject>;
  /** Store setup run before the RPC server starts, such as choosing the current item. */
  readonly configure?: (store: FakeProjectStore) => void;
}

/**
 * Mounts the tray card window's renderer with the real RPC client wired to an
 * in-process fake server, as Electron main shows it beside the tray icon.
 */
export async function renderTrayCard({ projects = [], configure }: RenderTrayCardOptions = {}) {
  const store = new FakeProjectStore(projects);
  configure?.(store);
  const server = await startFakeServer(store);
  onTestFinished(() => server.close());
  const protocol = rpcProtocolLayer(TEST_CONNECTION, { fetch: server.fetch });

  const screen = await render(<TrayCardRoot protocol={protocol} />);

  return { screen, store };
}
