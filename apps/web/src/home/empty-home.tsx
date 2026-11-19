import { FolderPlus, Plus } from "lucide-react";
import { Button } from "../ui/button.js";

/** The home screen before any project exists. */
export function EmptyHome({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <div
      data-testid="empty-home"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-16 text-center"
    >
      <span className="grid size-10 place-items-center rounded-card bg-hover text-fg-muted">
        <FolderPlus size={20} aria-hidden="true" />
      </span>
      <p className="text-[15px] font-medium">No projects yet</p>
      <p className="text-fg-muted">Create one to get started.</p>
      <Button
        variant="secondary"
        className="mt-2"
        onClick={onCreate}
        data-testid="empty-home-create"
      >
        <Plus size={15} aria-hidden="true" />
        New project
      </Button>
    </div>
  );
}
