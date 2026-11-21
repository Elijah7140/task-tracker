import type { FolderProjection, ProjectSummary } from "@task-tracker/contracts";
import { Select } from "../ui/select.js";
import {
  type BatchDestination,
  folderOptions,
  projectOptions,
  TOP_LEVEL,
} from "./batch-destination.js";

/** Props for {@link BatchDestinationPicker}. */
export interface BatchDestinationPickerProps {
  readonly projects: ReadonlyArray<typeof ProjectSummary.Type>;
  /** The chosen project's folders. */
  readonly folders: ReadonlyArray<typeof FolderProjection.Type>;
  readonly destination: BatchDestination;
  readonly onChange: (destination: BatchDestination) => void;
}

/**
 * The project and folder every ticket in the batch goes to (§7.20). Changing the project
 * starts at its top level.
 */
export function BatchDestinationPicker({
  projects,
  folders,
  destination,
  onChange,
}: BatchDestinationPickerProps) {
  return (
    <div role="group" aria-label="Add to" className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[13px] text-fg-muted">Add to</span>
      <Select
        value={destination.projectId}
        onValueChange={(projectId) => onChange({ projectId, folderId: null })}
        options={projectOptions(projects)}
        ariaLabel="Project"
        testId="ticket-batch-project"
        size="sm"
        className="w-48 min-w-0"
      />
      <Select
        value={destination.folderId ?? TOP_LEVEL}
        onValueChange={(value) =>
          onChange({ ...destination, folderId: value === TOP_LEVEL ? null : value })
        }
        options={folderOptions(folders)}
        ariaLabel="Folder"
        testId="ticket-batch-folder"
        size="sm"
        className="w-48 min-w-0"
      />
    </div>
  );
}
