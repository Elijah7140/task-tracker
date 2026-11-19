import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { TrashBatch } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ArrowLeft, CircleAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { trashBatchesAtom } from "../rpc/trash-queries.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { Button } from "../ui/button.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { Select } from "../ui/select.js";
import { TrashBatchRow } from "./trash-batch-row.js";
import { useTrashActions } from "./use-trash-actions.js";

type Batch = typeof TrashBatch.Type;
type Scope = "project" | "all";

const SCOPE_OPTIONS = [
  { value: "project", label: "This project" },
  { value: "all", label: "All projects" },
] as const;

function EmptyTrash() {
  return (
    <div
      data-testid="trash-empty"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-16 text-center"
    >
      <span className="grid size-10 place-items-center rounded-card bg-hover text-fg-muted">
        <Trash2 size={20} aria-hidden="true" />
      </span>
      <p className="text-[15px] font-medium">The trash is empty.</p>
      <p className="text-fg-muted">Deleted projects, folders and items appear here.</p>
    </div>
  );
}

function TrashError({ message }: { readonly message: string }) {
  return (
    <p
      role="alert"
      data-testid="trash-error"
      className="flex items-start gap-2 rounded-card border border-line bg-danger-soft px-4 py-3 text-[13px] text-danger"
    >
      <CircleAlert size={15} aria-hidden="true" className="mt-px shrink-0" />
      {message}
    </p>
  );
}

interface TrashHeaderProps {
  readonly scope: Scope | null;
  readonly onScopeChange: (scope: Scope) => void;
  readonly canEmpty: boolean;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onEmpty: () => void;
}

function TrashHeader({ scope, onScopeChange, canEmpty, busy, onBack, onEmpty }: TrashHeaderProps) {
  return (
    <PageHeader
      title="Trash"
      eyebrow={
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2 self-start"
          disabled={busy}
          onClick={onBack}
          data-testid="trash-back"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back
        </Button>
      }
      actions={
        <>
          {scope === null ? null : (
            <Select
              value={scope}
              onValueChange={onScopeChange}
              options={SCOPE_OPTIONS}
              ariaLabel="Trash scope"
              disabled={busy}
              testId="trash-scope"
              className="w-36"
            />
          )}
          <Button disabled={busy || !canEmpty} onClick={onEmpty} data-testid="trash-empty-all">
            <Trash2 size={14} aria-hidden="true" />
            Empty trash
          </Button>
        </>
      }
    />
  );
}

interface TrashListProps {
  readonly batches: ReadonlyArray<Batch>;
  readonly busy: boolean;
  readonly onRestore: (batch: Batch) => void;
  readonly onPurge: (batch: Batch) => void;
}

function TrashList({ batches, busy, onRestore, onPurge }: TrashListProps) {
  if (batches.length === 0) {
    return <EmptyTrash />;
  }
  return (
    <div className="flex flex-col gap-3" data-testid="trash-list">
      {batches.map((batch) => (
        <TrashBatchRow
          key={batch.batchId}
          batch={batch}
          busy={busy}
          onRestore={onRestore}
          onPurge={onPurge}
        />
      ))}
    </div>
  );
}

/**
 * The Trash (§7.6): deletion batches in scope, newest first, with Restore,
 * Delete permanently and Empty trash. Opened from a workspace it starts on that
 * project and can widen to all projects. Reading the list through a query atom
 * per scope means a newer scope's load replaces an older one, and leaving the
 * page ignores any load still running.
 */
export function TrashPage({ onBack }: { readonly onBack: () => void }) {
  const originProjectId = useReturnPageStore((state) => state.originProjectId);
  const busy = useReturnPageStore((state) => state.busy);
  const [scope, setScope] = useState<Scope>(originProjectId === null ? "all" : "project");
  const atom = trashBatchesAtom(scope === "project" ? originProjectId : null);
  const result = useAtomValue(atom);
  const reload = useAtomRefresh(atom);
  const batches = AsyncResult.isSuccess(result) ? result.value : [];
  const actions = useTrashActions({
    projectId: scope === "project" ? originProjectId : null,
    batches,
    reload,
  });
  const changeScope = (next: Scope) => {
    actions.clearError();
    setScope(next);
  };

  return (
    <PageContainer>
      <TrashHeader
        scope={originProjectId === null ? null : scope}
        onScopeChange={changeScope}
        canEmpty={batches.length > 0}
        busy={busy}
        onBack={onBack}
        onEmpty={() => void actions.emptyTrash()}
      />
      <div className="flex flex-col gap-4">
        {actions.error === null ? null : <TrashError message={actions.error} />}
        {AsyncResult.isInitial(result) ? (
          <p className="text-fg-muted" data-testid="trash-loading">
            Loading trash…
          </p>
        ) : AsyncResult.isFailure(result) ? (
          <LoadFailure message={describeRpcFailure(result.cause)} onRetry={reload} />
        ) : (
          <TrashList
            batches={batches}
            busy={busy}
            onRestore={(batch) => void actions.restoreBatch(batch)}
            onPurge={(batch) => void actions.purgeBatch(batch)}
          />
        )}
      </div>
    </PageContainer>
  );
}
