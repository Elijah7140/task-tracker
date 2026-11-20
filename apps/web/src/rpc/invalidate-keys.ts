import { Layer } from "effect";
import { Atom, Reactivity } from "effect/reactivity";

const reactivityRuntime = Atom.runtime(Layer.empty);

/** Invalidates reactivity keys outside a mutation, so the queries that carry them reload. */
export const invalidateKeysAtom = reactivityRuntime.fn((keys: ReadonlyArray<string>) =>
  Reactivity.invalidate(keys),
);
