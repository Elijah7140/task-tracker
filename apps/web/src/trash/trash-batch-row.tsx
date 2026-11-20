import type { TrashBatch } from "@task-tracker/contracts";
import { Circle, Folder, RotateCcw } from "lucide-react";
import { useId } from "react";
import { ProjectIcon } from "../shell/project-icon.js";
import { Button } from "../ui/button.js";
import {
  trashContents,
  trashDeletionTime,
  trashKindLabel,
  trashLocation,
} from "./trash-row-labels.js";
import { TRASH_ROW_ATTRIBUTE } from "./use-trash-focus.js";

type Batch = typeof TrashBatch.Type;

/** Props for {@link TrashBatchRow}. */
export interface TrashBatchRowProps {
  readonly batch: Batch;
  readonly busy: boolean;
  readonly onRestore: (batch: Batch) => void;
  readonly onPurge: (batch: Batch) => void;
}

function KindIcon({ batch }: { readonly batch: Batch }) {
  switch (batch.kind) {
    case "project":
      return <ProjectIcon name={batch.title} />;
    case "folder":
      return <Folder size={16} aria-hidden="true" className="text-fg-subtle" />;
    case "item":
      return <Circle size={15} aria-hidden="true" className="text-fg-subtle" />;
  }
}

function BatchDetails({ batch, reasonId }: { readonly batch: Batch; readonly reasonId: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="truncate text-[15px] font-medium">{batch.title}</h2>
        <span className="shrink-0 text-xs text-fg-subtle">{trashKindLabel(batch.kind)}</span>
      </div>
      <p className="truncate text-[13px] text-fg-muted">
        Was in: <span className="text-fg">{trashLocation(batch.path)}</span>
      </p>
      <p className="flex gap-3 text-[13px] text-fg-muted">
        <span>Deleted {trashDeletionTime(batch.deletedAt)}</span>
        <span aria-hidden="true">·</span>
        <span>{trashContents(batch.folderCount, batch.itemCount)}</span>
      </p>
      {batch.restoreBlockedReason === null ? null : (
        <p id={reasonId} className="text-[13px] text-danger" data-testid="trash-restore-blocked">
          {batch.restoreBlockedReason}
        </p>
      )}
    </div>
  );
}

/**
 * One deletion batch: what was deleted, where it was, when, and what it
 * contains. Restore is disabled with the reason shown while an owner is still
 * deleted (§7.6).
 */
export function TrashBatchRow({ batch, busy, onRestore, onPurge }: TrashBatchRowProps) {
  const reasonId = useId();
  const blocked = batch.restoreBlockedReason !== null;
  return (
    <article
      aria-label={batch.title}
      tabIndex={-1}
      data-testid="trash-batch"
      {...{ [TRASH_ROW_ATTRIBUTE]: batch.batchId }}
      className="flex items-center gap-4 rounded-card border border-line bg-surface px-5 py-4 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span className="grid size-5 shrink-0 place-items-center self-start pt-1">
        <KindIcon batch={batch} />
      </span>
      <BatchDetails batch={batch} reasonId={reasonId} />
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          disabled={busy || blocked}
          aria-describedby={blocked ? reasonId : undefined}
          onClick={() => onRestore(batch)}
          data-testid="trash-restore"
        >
          <RotateCcw size={13} aria-hidden="true" />
          Restore
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onPurge(batch)}
          data-testid="trash-purge"
        >
          Delete permanently
        </Button>
      </div>
    </article>
  );
}
