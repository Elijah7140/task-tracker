import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/** A yes/no question. `danger` styles the confirm button for destructive actions. */
export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string | undefined;
  readonly tone?: "default" | "danger" | undefined;
}

/** A single-line text question, such as a name. */
export interface PromptOptions {
  readonly title: string;
  readonly label: string;
  readonly initialValue?: string | undefined;
  readonly confirmLabel?: string | undefined;
}

/** An acknowledgement-only notice, such as a rejected action. */
export interface MessageOptions {
  readonly title: string;
  readonly message: string;
}

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
  | Pending<"message", MessageOptions, undefined>;

/** Pending dialogs and the actions that open and settle them. */
export interface DialogState {
  readonly queue: ReadonlyArray<DialogRequest>;
  readonly nextId: number;
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  readonly prompt: (options: PromptOptions) => Promise<string | null>;
  readonly notify: (options: MessageOptions) => Promise<undefined>;
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
      notify: (options) =>
        new Promise((resolve) => push({ kind: "message", options, title: options.title, resolve })),
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
      return request.resolve(result === true);
    case "prompt":
      return request.resolve(typeof result === "string" ? result : null);
    case "message":
      return request.resolve(undefined);
  }
}

/** The app's dialog queue, shared by every flow. */
export const dialogStore = createDialogStore();

/** Asks a yes/no question and resolves with the answer. Escape answers no. */
export const confirm = (options: ConfirmOptions) => dialogStore.getState().confirm(options);

/** Asks for one line of text and resolves with it, or null when cancelled. */
export const prompt = (options: PromptOptions) => dialogStore.getState().prompt(options);

/** Shows a notice and resolves when the user dismisses it. */
export const notify = (options: MessageOptions) => dialogStore.getState().notify(options);

/** The dialog currently shown, if any. */
export const useActiveDialog = () => useStore(dialogStore, (state) => state.queue[0]);
