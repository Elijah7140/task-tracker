import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef } from "react";
import type { ConfirmOptions } from "../state/dialog-store.js";
import { Button } from "../ui/button.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { useDialogLifecycle } from "./use-dialog-lifecycle.js";

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  readonly id: number;
  readonly options: ConfirmOptions;
}

/**
 * The shared yes/no dialog for project, workspace and settings flows. Focus
 * starts on the confirm button, so Enter confirms and Escape cancels.
 */
export function ConfirmDialog({ id, options }: ConfirmDialogProps) {
  const lifecycle = useDialogLifecycle<boolean>(id, false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root
      open={lifecycle.open}
      onOpenChange={lifecycle.onOpenChange}
      onOpenChangeComplete={lifecycle.onOpenChangeComplete}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogStyles.backdrop} />
        <AlertDialog.Popup
          className={dialogStyles.popup}
          initialFocus={confirmRef}
          data-testid="confirm-dialog"
        >
          <div className={dialogStyles.header}>
            <AlertDialog.Title className={dialogStyles.title}>{options.title}</AlertDialog.Title>
            <AlertDialog.Description className={dialogStyles.description}>
              {options.message}
            </AlertDialog.Description>
          </div>
          <div className={dialogStyles.footer}>
            <Button onClick={() => lifecycle.close(false)} data-testid="confirm-dialog-cancel">
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              variant={options.tone === "danger" ? "danger" : "primary"}
              onClick={() => lifecycle.close(true)}
              data-testid="confirm-dialog-confirm"
            >
              {options.confirmLabel ?? "OK"}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
