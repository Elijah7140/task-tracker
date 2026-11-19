import { Dialog } from "@base-ui/react/dialog";
import { type FormEvent, useRef, useState } from "react";
import type { PromptOptions } from "../state/dialog-store.js";
import { Button } from "../ui/button.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { TextField } from "../ui/text-field.js";
import { useDialogLifecycle } from "./use-dialog-lifecycle.js";

/** Props for {@link PromptDialog}. */
export interface PromptDialogProps {
  readonly id: number;
  readonly options: PromptOptions;
}

/**
 * Asks for a single line, such as a project name. Enter submits the text as
 * typed and Escape cancels. The server validates the value.
 */
export function PromptDialog({ id, options }: PromptDialogProps) {
  const lifecycle = useDialogLifecycle<string | null>(id, null);
  const [value, setValue] = useState(options.initialValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    lifecycle.close(value);
  };

  return (
    <Dialog.Root
      open={lifecycle.open}
      onOpenChange={lifecycle.onOpenChange}
      onOpenChangeComplete={lifecycle.onOpenChangeComplete}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogStyles.backdrop} />
        <Dialog.Popup
          className={dialogStyles.popup}
          initialFocus={inputRef}
          data-testid="prompt-dialog"
        >
          <Dialog.Title className={dialogStyles.title}>{options.title}</Dialog.Title>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <TextField
              label={options.label}
              value={value}
              onValueChange={setValue}
              inputRef={inputRef}
              onFocus={(event) => event.currentTarget.select()}
              testId="prompt-dialog-input"
            />
            <div className={dialogStyles.footer}>
              <Button onClick={() => lifecycle.close(null)} data-testid="prompt-dialog-cancel">
                Cancel
              </Button>
              <Button type="submit" variant="primary" data-testid="prompt-dialog-submit">
                {options.confirmLabel ?? "Save"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
