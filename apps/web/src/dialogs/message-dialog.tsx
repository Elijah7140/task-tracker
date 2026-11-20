import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { MessageOptions } from "../state/dialog-store.js";
import { Button } from "../ui/button.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { useDialogLifecycle } from "./use-dialog-lifecycle.js";

/** Props for {@link MessageDialog}. */
export interface MessageDialogProps {
  readonly id: number;
  readonly options: MessageOptions;
}

/** A notice the user acknowledges, such as a rejected project action. */
export function MessageDialog({ id, options }: MessageDialogProps) {
  const lifecycle = useDialogLifecycle<undefined>(id, undefined);

  return (
    <AlertDialog.Root
      open={lifecycle.open}
      onOpenChange={lifecycle.onOpenChange}
      onOpenChangeComplete={lifecycle.onOpenChangeComplete}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogStyles.backdrop} />
        <AlertDialog.Popup className={dialogStyles.popup} data-testid="message-dialog">
          <div className={dialogStyles.header}>
            <AlertDialog.Title className={dialogStyles.title}>{options.title}</AlertDialog.Title>
            <AlertDialog.Description className={dialogStyles.description}>
              {options.message}
            </AlertDialog.Description>
          </div>
          <div className={dialogStyles.footer}>
            <Button
              variant="primary"
              onClick={() => lifecycle.close(undefined)}
              data-testid="message-dialog-ok"
            >
              OK
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
