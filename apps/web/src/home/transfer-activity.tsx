import { useTransferStore } from "../state/transfer-store.js";

/**
 * Home's import and export feedback (§7.9): an indeterminate progress bar while
 * a transfer RPC runs, and a polite status line with the latest result. Both
 * take no room until there is something to show.
 */
export function TransferActivity() {
  const working = useTransferStore((state) => state.working);
  const status = useTransferStore((state) => state.status);
  return (
    <>
      {working ? (
        <div
          role="progressbar"
          aria-label="Import and export in progress"
          data-testid="transfer-progress"
          className="mb-6 h-1 overflow-hidden rounded-full bg-hover"
        >
          <div className="h-full w-full rounded-full bg-accent motion-safe:animate-pulse" />
        </div>
      ) : null}
      <div role="status" aria-live="polite" data-testid="transfer-status">
        {status === null ? null : (
          <p key={status.id} className="mb-6 text-sm wrap-break-word text-fg-muted">
            {status.message}
          </p>
        )}
      </div>
    </>
  );
}
