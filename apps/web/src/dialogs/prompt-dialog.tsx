import { trimText } from "@task-tracker/contracts";
import { Dialog } from "@base-ui/react/dialog";
import { type FormEvent, useRef, useState } from "react";
import type { PromptOptions } from "../state/dialog-store.js";
import { Button } from "../ui/button.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { TextField } from "../ui/text-field.js";
import { validatePromptValue } from "./name-validation.js";
import { useDialogLifecycle } from "./use-dialog-lifecycle.js";

/** Props for {@link PromptDialog}. */
export interface PromptDialogProps {
  readonly id: number;
  readonly options: PromptOptions;
}

/**
 * Asks for a single line, such as a project name. Enter submits and Escape
 * cancels. With `options.validation` it checks the trimmed length as the
 * legacy dialog did: Save stays disabled and the message shows inline until
 * the value fits, and the trimmed value is returned. The server still
 * validates every value.
 */
export function PromptDialog({ id, options }: PromptDialogProps) {
  const lifecycle = useDialogLifecycle<string | null>(id, null);
  const [value, setValue] = useState(options.initialValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const { validation } = options;
  const error = validation === undefined ? null : validatePromptValue(value, validation);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (error !== null) {
      return;
    }
    lifecycle.close(validation === undefined ? value : trimText(value));
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
              error={error}
              errorTestId="prompt-dialog-error"
            />
            <div className={dialogStyles.footer}>
              <Button onClick={() => lifecycle.close(null)} data-testid="prompt-dialog-cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={error !== null}
                data-testid="prompt-dialog-submit"
              >
                {options.confirmLabel ?? "Save"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
