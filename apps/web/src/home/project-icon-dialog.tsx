import { Dialog } from "@base-ui/react/dialog";
import { useAtomSet } from "@effect/atom-react";
import { useRef } from "react";
import { reportFailure } from "../dialogs/report-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { PROJECTS_KEY, setProjectIconAtom } from "../rpc/project-queries.js";
import { ProjectIcon } from "../shell/project-icon.js";
import { PROJECT_ICONS } from "../shell/project-icons.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { dialogStyles } from "../ui/dialog-styles.js";

/** The project whose icon the dialog changes. */
export interface IconTarget {
  readonly id: string;
  readonly name: string;
  readonly iconKey: string | null;
}

const tileClass =
  "grid size-10 cursor-default place-items-center rounded-control border text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus";

function useSetIcon() {
  const setIcon = useAtomSet(setProjectIconAtom, { mode: "promiseExit" });
  return async (projectId: string, iconKey: string | null) =>
    reportFailure(
      "Project action failed",
      await setIcon({
        payload: { projectId, iconKey },
        reactivityKeys: [PROJECTS_KEY, HISTORY_KEY],
      }),
    );
}

/**
 * Picks a project's icon for the Home card and the sidebar (§7.19), or goes back to the
 * initial. A choice saves at once as one undo step and closes the dialog.
 */
export function ProjectIconDialog({
  target,
  onClose,
}: {
  readonly target: IconTarget | null;
  readonly onClose: () => void;
}) {
  const setIcon = useSetIcon();
  const selectedRef = useRef<HTMLButtonElement>(null);
  const choose = async (iconKey: string | null) => {
    if (target !== null && (await setIcon(target.id, iconKey))) {
      onClose();
    }
  };
  return (
    <Dialog.Root open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogStyles.backdrop} />
        <Dialog.Popup
          initialFocus={selectedRef}
          className={cx(dialogStyles.popup, "w-[25rem]")}
          data-testid="project-icon-dialog"
        >
          <div className={dialogStyles.header}>
            <Dialog.Title className={dialogStyles.title}>Change icon</Dialog.Title>
            <Dialog.Description className="text-sm text-fg-muted">
              {target === null ? null : `Choose an icon for ${target.name}.`}
            </Dialog.Description>
          </div>
          <div role="group" aria-label="Icons" className="grid grid-cols-7 gap-1.5">
            <button
              type="button"
              ref={target?.iconKey === null ? selectedRef : undefined}
              aria-label="Initial"
              aria-pressed={target?.iconKey === null}
              title="Initial"
              data-testid="project-icon-initial"
              onClick={() => void choose(null)}
              className={cx(tileClass, target?.iconKey === null ? "border-accent" : "border-line")}
            >
              <ProjectIcon name={target?.name ?? ""} iconKey={null} />
            </button>
            {PROJECT_ICONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                ref={target?.iconKey === key ? selectedRef : undefined}
                aria-label={label}
                aria-pressed={target?.iconKey === key}
                title={label}
                data-testid={`project-icon-${key}`}
                onClick={() => void choose(key)}
                className={cx(
                  tileClass,
                  target?.iconKey === key ? "border-accent text-accent-text" : "border-line",
                )}
              >
                <Icon size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={dialogStyles.footer}>
            <Button onClick={onClose} data-testid="project-icon-cancel">
              Cancel
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
