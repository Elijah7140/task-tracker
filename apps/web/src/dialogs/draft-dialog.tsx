import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef } from "react";
import type { DraftDecision, DraftOptions } from "../state/dialog-store.js";
import { Button } from "../ui/button.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { useDialogLifecycle } from "./use-dialog-lifecycle.js";

/** Props for {@link DraftDialog}. */
export interface DraftDialogProps {
  readonly id: number;
  readonly options: DraftOptions;
}

/**
 * Asks what to do with unsaved changes, like the legacy Save / Discard /
 * Cancel prompt. Focus starts on Save, so Enter saves and Escape cancels.
 */
export function DraftDialog({ id, options }: DraftDialogProps) {
  const lifecycle = useDialogLifecycle<DraftDecision>(id, "cancel");
  const saveRef = useRef<HTMLButtonElement>(null);

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
          initialFocus={saveRef}
          data-testid="draft-dialog"
        >
          <div className={dialogStyles.header}>
            <AlertDialog.Title className={dialogStyles.title}>{options.title}</AlertDialog.Title>
            <AlertDialog.Description className={dialogStyles.description}>
              {options.message}
            </AlertDialog.Description>
          </div>
          <div className={dialogStyles.footer}>
            <Button onClick={() => lifecycle.close("cancel")} data-testid="draft-dialog-cancel">
              Cancel
            </Button>
            <Button onClick={() => lifecycle.close("discard")} data-testid="draft-dialog-discard">
              Discard
            </Button>
            <Button
              ref={saveRef}
              variant="primary"
              onClick={() => lifecycle.close("save")}
              data-testid="draft-dialog-save"
            >
              Save
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
