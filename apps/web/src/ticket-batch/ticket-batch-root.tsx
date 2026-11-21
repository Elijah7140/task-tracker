import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useState } from "react";
import { useDataChangeListener } from "../native/data-change-broadcast.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { projectSummariesAtom } from "../rpc/project-queries.js";
import { rpcProtocolAtom, type RpcProtocolLayer } from "../rpc/task-tracker-client.js";
import { useAppliedTheme } from "../state/use-applied-theme.js";
import { type BatchDestination, readStoredDestination } from "./batch-destination.js";
import { emptyBatch, hasUnsavedTickets, type TicketBatch } from "./ticket-batch-entries.js";
import { TicketBatchView } from "./ticket-batch-view.js";
import { useUnsavedGuard } from "./use-unsaved-guard.js";

function NoProjects() {
  return (
    <main data-testid="ticket-batch-no-projects" className="flex flex-col gap-1 p-5 text-fg">
      <p className="font-semibold">No projects yet.</p>
      <p className="text-[13px] text-fg-muted">
        Create a project in Task Tracker, then add tickets to it here.
      </p>
    </main>
  );
}

/**
 * Holds the batch and the chosen destination above the view, so reloading projects or
 * folders never loses typing. Done clears the batch, which lifts the unsaved guard, and
 * the window closes once it has.
 */
function TicketBatchScreen({ onClose }: { readonly onClose: () => void }) {
  const [batch, setBatch] = useState<TicketBatch>(emptyBatch);
  const [chosen, setChosen] = useState<BatchDestination | null>(readStoredDestination);
  const [closing, setClosing] = useState(false);
  const unsaved = hasUnsavedTickets(batch);
  const projects = useAtomValue(projectSummariesAtom);
  useAppliedTheme();
  useDataChangeListener();
  useUnsavedGuard(unsaved);
  useEffect(() => {
    if (closing && !unsaved) {
      onClose();
    }
  }, [closing, unsaved, onClose]);

  return AsyncResult.match(projects, {
    onInitial: () => null,
    onFailure: ({ cause }) => (
      <p role="alert" data-testid="ticket-batch-load-failure" className="p-5 text-danger">
        {describeRpcFailure(cause)}
      </p>
    ),
    onSuccess: ({ value }) =>
      value.length === 0 ? (
        <NoProjects />
      ) : (
        <TicketBatchView
          projects={value}
          batch={batch}
          onBatchChange={setBatch}
          chosen={chosen}
          onChoose={setChosen}
          onSaved={() => {
            setBatch(emptyBatch());
            setClosing(true);
          }}
        />
      ),
  });
}

const closeWindow = () => window.close();

/**
 * The multi-ticket add window's renderer (§7.20), opened from the tray menu with the
 * launch's RPC transport, in the app's theme. `onClose` defaults to closing the window.
 */
export function TicketBatchRoot({
  protocol,
  onClose = closeWindow,
}: {
  readonly protocol: RpcProtocolLayer;
  readonly onClose?: (() => void) | undefined;
}) {
  return (
    <RegistryProvider initialValues={[[rpcProtocolAtom, protocol]]}>
      <TicketBatchScreen onClose={onClose} />
    </RegistryProvider>
  );
}
