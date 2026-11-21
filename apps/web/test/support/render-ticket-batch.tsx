import { onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { rpcProtocolLayer } from "../../src/rpc-client.js";
import { TicketBatchRoot } from "../../src/ticket-batch/ticket-batch-root.js";
import { FakeProjectStore, type SeedProject, startFakeServer } from "./fake-task-tracker-server.js";

const TEST_CONNECTION = { port: 49152, credential: "T".repeat(43) };

/** The multi-ticket add window's default size, which Electron main opens it at (§7.20). */
export const TICKET_BATCH_SIZE = { width: 960, height: 640 } as const;

/** Options for {@link renderTicketBatch}. */
export interface RenderTicketBatchOptions {
  readonly projects?: ReadonlyArray<SeedProject>;
  /** Store setup run before the RPC server starts, such as seeding ticket lists. */
  readonly configure?: (store: FakeProjectStore) => void;
}

/**
 * Mounts the multi-ticket add window's renderer at its window size, with the real RPC
 * client wired to an in-process fake server. `onClose` stands in for closing the window.
 */
export async function renderTicketBatch({
  projects = [],
  configure,
}: RenderTicketBatchOptions = {}) {
  const store = new FakeProjectStore(projects);
  configure?.(store);
  const server = await startFakeServer(store);
  onTestFinished(() => server.close());
  const protocol = rpcProtocolLayer(TEST_CONNECTION, { fetch: server.fetch });
  const onClose = vi.fn<() => void>();

  const screen = await render(
    <div data-testid="ticket-batch-window" style={TICKET_BATCH_SIZE}>
      <TicketBatchRoot protocol={protocol} onClose={onClose} />
    </div>,
  );

  return { screen, store, onClose };
}
