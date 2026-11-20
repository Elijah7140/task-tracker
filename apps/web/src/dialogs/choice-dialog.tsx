import { Dialog } from "@base-ui/react/dialog";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import type { ChoiceOption, ChooseOptions } from "../state/dialog-store.js";
import { Button } from "../ui/button.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { useDialogLifecycle } from "./use-dialog-lifecycle.js";

/** Props for {@link ChoiceDialog}. */
export interface ChoiceDialogProps {
  readonly id: number;
  readonly options: ChooseOptions;
}

function ChoiceRow({ option }: { readonly option: ChoiceOption }) {
  return (
    <label
      className="flex h-8 cursor-default items-center gap-2.5 rounded-[0.375rem] pr-2 text-sm hover:bg-hover has-data-checked:bg-accent-soft"
      style={{ paddingLeft: `${0.5 + (option.depth ?? 0) * 1.125}rem` }}
    >
      <Radio.Root
        value={option.value}
        data-testid="choice-dialog-option"
        className="grid size-4 shrink-0 place-items-center rounded-full border border-control-outline bg-canvas outline-none focus-visible:ring-3 focus-visible:ring-focus data-checked:border-accent data-checked:bg-accent"
      >
        <Radio.Indicator className="size-1.5 rounded-full bg-on-accent" />
      </Radio.Root>
      <span className="truncate">{option.label}</span>
    </label>
  );
}

/**
 * Asks for one option from a list, such as where to move a folder. Arrow keys
 * change the choice, Enter confirms it and Escape cancels.
 */
export function ChoiceDialog({ id, options }: ChoiceDialogProps) {
  const lifecycle = useDialogLifecycle<string | null>(id, null);
  const [value, setValue] = useState(options.initialValue ?? options.options[0]?.value ?? "");
  const groupRef = useRef<HTMLDivElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    lifecycle.close(value);
  };
  const submitOnEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      lifecycle.close(value);
    }
  };
  const focusChecked = () =>
    groupRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? true;

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
          initialFocus={focusChecked}
          data-testid="choice-dialog"
        >
          <Dialog.Title className={dialogStyles.title}>{options.title}</Dialog.Title>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <RadioGroup
              ref={groupRef}
              aria-label={options.label}
              value={value}
              onValueChange={(next: string) => setValue(next)}
              onKeyDown={submitOnEnter}
              className="flex max-h-72 flex-col gap-px overflow-y-auto rounded-control border border-line p-1"
            >
              {options.options.map((option) => (
                <ChoiceRow key={option.value} option={option} />
              ))}
            </RadioGroup>
            <div className={dialogStyles.footer}>
              <Button onClick={() => lifecycle.close(null)} data-testid="choice-dialog-cancel">
                Cancel
              </Button>
              <Button type="submit" variant="primary" data-testid="choice-dialog-submit">
                {options.confirmLabel ?? "Choose"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
