import { OperationFailed, RuleViolation } from "@task-tracker/contracts";
import { Effect } from "effect";

interface HistoryTarget<State> {
  readonly record: (tag: string) => Effect.Effect<unknown>;
  readonly captureUndoState: () => State;
  readonly restoreUndoState: (state: State) => void;
  readonly historyRefusal: string | null;
  readonly historyFailure: boolean;
}

interface FakeStep<State> {
  readonly label: string;
  readonly before: State;
  readonly after: State;
}

/** History endpoints behind the browser tests' real RPC client. */
export function fakeHistory<State>(store: HistoryTarget<State>) {
  const undone: FakeStep<State>[] = [];
  const saved: FakeStep<State>[] = [];
  let revision = 0;
  return {
    track: <A, E, R>(change: Effect.Effect<A, E, R>, label: (result: A) => string | null) =>
      Effect.gen(function* () {
        const before = store.captureUndoState();
        const result = yield* change;
        const description = label(result);
        if (description !== null) {
          saved.push({ label: description, before, after: store.captureUndoState() });
          if (saved.length > 50) {
            saved.shift();
          }
          undone.length = 0;
          revision++;
        }
        return result;
      }),
    handlers: {
      GetHistory: () =>
        store.record("GetHistory").pipe(
          Effect.map(() => ({
            undo: saved.at(-1)?.label ?? null,
            redo: undone.at(-1)?.label ?? null,
            revision,
          })),
        ),
      ApplyHistory: ({ direction }: { direction: "undo" | "redo" }) =>
        store.record("ApplyHistory").pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const [from, to] = direction === "undo" ? [saved, undone] : [undone, saved];
              const step = from.at(-1);
              if (step === undefined) {
                return null;
              }
              if (store.historyFailure) {
                return yield* Effect.fail(
                  new OperationFailed({ message: "The operation could not be completed." }),
                );
              }
              if (store.historyRefusal !== null) {
                return yield* Effect.fail(new RuleViolation({ message: store.historyRefusal }));
              }
              store.restoreUndoState(direction === "undo" ? step.before : step.after);
              from.pop();
              to.push(step);
              return { label: step.label, revision: ++revision };
            }),
          ),
        ),
    },
  };
}
