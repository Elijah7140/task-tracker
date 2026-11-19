import { Effect } from "effect";

/** Interrupts the server when its launcher closes the private stdin pipe. */
export const parentPipeClosed = Effect.callback<void>((resume) => {
  const onClose = () => resume(Effect.void);
  process.stdin.once("end", onClose).once("error", onClose).resume();
  return Effect.sync(() => {
    process.stdin.off("end", onClose).off("error", onClose).pause();
  });
});
