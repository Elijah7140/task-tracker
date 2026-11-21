import { useAtomValue } from "@effect/atom-react";
import type { ProjectSummary } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef, useState } from "react";
import type { AddItemDraft } from "../add/add-item-draft.js";
import { projectWorkspaceAtom } from "../rpc/project-queries.js";
import { BatchDestinationPicker } from "./batch-destination-picker.js";
import {
  type BatchDestination,
  resolveFolderId,
  resolveProjectId,
  storeDestination,
} from "./batch-destination.js";
import {
  addEntry,
  editEntry,
  hasTyping,
  rejectEntryAt,
  removeEntry,
  type TicketBatch,
} from "./ticket-batch-entries.js";
import { TicketBatchForm } from "./ticket-batch-form.js";
import { TicketBatchList } from "./ticket-batch-list.js";
import { useSaveTicketBatch } from "./use-save-ticket-batch.js";

/** Props for {@link TicketBatchView}. */
export interface TicketBatchViewProps {
  readonly projects: ReadonlyArray<typeof ProjectSummary.Type>;
  readonly batch: TicketBatch;
  readonly onBatchChange: (batch: TicketBatch) => void;
  /** The destination last picked; resolved here against the current projects and folders. */
  readonly chosen: BatchDestination | null;
  readonly onChoose: (destination: BatchDestination) => void;
  /** Called after Done saved the batch and cleared the view. */
  readonly onSaved: () => void;
}

/** The chosen destination, falling back to the first project and its top level. */
function useDestination(
  chosen: BatchDestination | null,
  projects: TicketBatchViewProps["projects"],
) {
  const projectId = resolveProjectId(chosen, projects) ?? "";
  const workspace = useAtomValue(projectWorkspaceAtom(projectId));
  const folders = AsyncResult.isSuccess(workspace) ? workspace.value.folders : [];
  const destination = { projectId, folderId: resolveFolderId(chosen, projectId, folders) };
  return { destination, folders };
}

/** Done: saves the listed tickets, or marks the refused one and explains why. */
function useDone(props: TicketBatchViewProps, destination: BatchDestination) {
  const save = useSaveTicketBatch();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = async () => {
    if (saving || props.batch.entries.length === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    const result = await save(destination, props.batch.entries);
    setSaving(false);
    if (result.ok) {
      storeDestination(destination);
      props.onSaved();
      return;
    }
    setError(result.message);
    if (result.index !== null) {
      props.onBatchChange(rejectEntryAt(props.batch, result.index));
    }
  };
  return { done, saving, error };
}

/**
 * The multi-ticket add view (§7.20): the destination across the top, the ticket form on
 * the left and the tickets to add on the right, with Done at the bottom right.
 */
export function TicketBatchView(props: TicketBatchViewProps) {
  const { projects, batch, onBatchChange, onChoose } = props;
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [formError, setFormError] = useState<string | null>(null);
  const { destination, folders } = useDestination(props.chosen, projects);
  const { done, saving, error } = useDone(props, destination);
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const onChange = (change: Partial<AddItemDraft>) => {
    onBatchChange({ ...batch, draft: { ...batch.draft, ...change } });
    setFormError(null);
  };
  const onAdd = () => {
    const result = addEntry(batch, `ticket-${nextKey.current++}`);
    if (result.ok) {
      onBatchChange(result.batch);
    } else {
      setFormError(result.message);
    }
    firstFieldRef.current?.focus();
  };
  const onEdit = (key: string) => {
    onBatchChange(editEntry(batch, key));
    firstFieldRef.current?.focus();
  };

  return (
    <main data-testid="ticket-batch" className="flex h-full min-h-0 flex-col bg-surface text-fg">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-5">
        <h1 className="mr-auto text-[14px] font-semibold tracking-tight">Add tickets</h1>
        <BatchDestinationPicker
          projects={projects}
          folders={folders}
          destination={destination}
          onChange={onChoose}
        />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <TicketBatchForm
          draft={batch.draft}
          onChange={onChange}
          onAdd={onAdd}
          error={formError}
          firstFieldRef={firstFieldRef}
        />
        <TicketBatchList
          entries={batch.entries}
          rejectedKey={batch.rejectedKey}
          canEdit={!hasTyping(batch.draft)}
          onEdit={onEdit}
          onRemove={(key) => onBatchChange(removeEntry(batch, key))}
          onDone={() => void done()}
          saving={saving}
          error={error}
        />
      </div>
    </main>
  );
}
