import type { CsvImportPreview } from "@task-tracker/contracts";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * A yes/no question. `danger` styles the confirm button for destructive actions.
 * `cancelIsDefault` focuses Cancel for irreversible actions, so Enter and Escape
 * both cancel and only a click on the confirm button proceeds.
 */
export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string | undefined;
  readonly tone?: "default" | "danger" | undefined;
  readonly cancelIsDefault?: boolean | undefined;
}

/** Client-side rules for a prompt: the trimmed value must be 1 to `maxLength` characters. */
export interface PromptValidation {
  readonly maxLength: number;
  readonly emptyMessage: string;
  readonly tooLongMessage: string;
}

/**
 * A single-line text question, such as a name. With `validation` the dialog
 * stays open, disables Save and shows the message inline until the trimmed
 * value fits, then resolves with the trimmed value.
 */
export interface PromptOptions {
  readonly title: string;
  readonly label: string;
  readonly initialValue?: string | undefined;
  readonly confirmLabel?: string | undefined;
  readonly validation?: PromptValidation | undefined;
}

/** One option of a choice dialog. `depth` indents it, for example a folder in a tree. */
export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly depth?: number | undefined;
}

/** A single choice from a list, such as a destination folder. */
export interface ChooseOptions {
  readonly title: string;
  /** The accessible name of the option list. */
  readonly label: string;
  readonly options: ReadonlyArray<ChoiceOption>;
  readonly initialValue?: string | undefined;
  readonly confirmLabel?: string | undefined;
}

/** An acknowledgement-only notice, such as a rejected action. */
export interface MessageOptions {
  readonly title: string;
  readonly message: string;
}

/** A question about an unsaved draft before an action replaces or closes it. */
export interface DraftOptions {
  readonly title: string;
  readonly message: string;
}

/**
 * A CSV import preview (§7.9): the file's rows, columns and problems for a
 * target. It offers Import only when the file can be imported.
 */
export interface CsvPreviewOptions {
  readonly title: string;
  readonly preview: typeof CsvImportPreview.Type;
  /** The target project, and folder when there is one, such as "Billing / Tables". */
  readonly targetName: string;
}

/** What to do with an unsaved draft. Escape or dismissal answers `cancel`. */
export type DraftDecision = "save" | "discard" | "cancel";

interface Pending<Kind extends string, Options, Result> {
  readonly kind: Kind;
  readonly id: number;
  readonly options: Options;
  readonly title: string;
  readonly resolve: (result: Result) => void;
}

/** A dialog waiting for the user, tagged by kind with its typed result. */
export type DialogRequest =
  | Pending<"confirm", ConfirmOptions, boolean>
  | Pending<"prompt", PromptOptions, string | null>
  | Pending<"choose", ChooseOptions, string | null>
  | Pending<"message", MessageOptions, undefined>
  | Pending<"draft", DraftOptions, DraftDecision>
  | Pending<"csv-preview", CsvPreviewOptions, boolean>;

/** Pending dialogs and the actions that open and settle them. */
export interface DialogState {
  readonly queue: ReadonlyArray<DialogRequest>;
  readonly nextId: number;
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  readonly prompt: (options: PromptOptions) => Promise<string | null>;
  readonly choose: (options: ChooseOptions) => Promise<string | null>;
  readonly notify: (options: MessageOptions) => Promise<undefined>;
  readonly resolveDraft: (options: DraftOptions) => Promise<DraftDecision>;
  readonly previewCsv: (options: CsvPreviewOptions) => Promise<boolean>;
  readonly settle: (id: number, result: boolean | string | null | undefined) => void;
}

type NewRequest = DialogRequest extends infer Request
  ? Request extends DialogRequest
    ? Omit<Request, "id">
    : never
  : never;

/**
 * Creates the dialog queue. Flows `await` a dialog like the legacy dialog
 * service. The dialog host shows the first request and settles it.
 */
export function createDialogStore() {
  return createStore<DialogState>()((set, get) => {
    const push = (request: NewRequest) =>
      set((state) => ({
        nextId: state.nextId + 1,
        queue: [...state.queue, { ...request, id: state.nextId } as DialogRequest],
      }));

    return {
      queue: [],
      nextId: 1,
      confirm: (options) =>
        new Promise((resolve) => push({ kind: "confirm", options, title: options.title, resolve })),
      prompt: (options) =>
        new Promise((resolve) => push({ kind: "prompt", options, title: options.title, resolve })),
      choose: (options) =>
        new Promise((resolve) => push({ kind: "choose", options, title: options.title, resolve })),
      notify: (options) =>
        new Promise((resolve) => push({ kind: "message", options, title: options.title, resolve })),
      resolveDraft: (options) =>
        new Promise((resolve) => push({ kind: "draft", options, title: options.title, resolve })),
      previewCsv: (options) =>
        new Promise((resolve) =>
          push({ kind: "csv-preview", options, title: options.title, resolve }),
        ),
      settle: (id, result) => {
        const request = get().queue.find((candidate) => candidate.id === id);
        if (request === undefined) {
          return;
        }
        set((state) => ({ queue: state.queue.filter((candidate) => candidate.id !== id) }));
        settleRequest(request, result);
      },
    };
  });
}

function settleRequest(request: DialogRequest, result: boolean | string | null | undefined) {
  switch (request.kind) {
    case "confirm":
    case "csv-preview":
      return request.resolve(result === true);
    case "prompt":
    case "choose":
      return request.resolve(typeof result === "string" ? result : null);
    case "message":
      return request.resolve(undefined);
    case "draft":
      return request.resolve(result === "save" || result === "discard" ? result : "cancel");
  }
}

/** The app's dialog queue, shared by every flow. */
export const dialogStore = createDialogStore();

/** Asks a yes/no question and resolves with the answer. Escape answers no. */
export const confirm = (options: ConfirmOptions) => dialogStore.getState().confirm(options);

/** Asks for one line of text and resolves with it, or null when cancelled. */
export const prompt = (options: PromptOptions) => dialogStore.getState().prompt(options);

/** Asks for one option from a list and resolves with its value, or null when cancelled. */
export const choose = (options: ChooseOptions) => dialogStore.getState().choose(options);

/** Shows a notice and resolves when the user dismisses it. */
export const notify = (options: MessageOptions) => dialogStore.getState().notify(options);

/** Asks whether to save, discard or keep editing an unsaved draft. */
export const resolveDraft = (options: DraftOptions) => dialogStore.getState().resolveDraft(options);

/** Shows a CSV import preview and resolves true when the user chooses Import. */
export const previewCsv = (options: CsvPreviewOptions) =>
  dialogStore.getState().previewCsv(options);

/** The dialog currently shown, if any. */
export const useActiveDialog = () => useStore(dialogStore, (state) => state.queue[0]);
