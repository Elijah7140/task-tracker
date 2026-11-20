import { createInterface } from "node:readline";
import { Effect, Queue, type Scope } from "effect";

/** Longer lines are ignored; main's messages are small. */
const MAX_LINE = 16_384;

function parseLine(line: string): unknown {
  try {
    return line.length > MAX_LINE ? undefined : (JSON.parse(line) as unknown);
  } catch {
    return undefined;
  }
}

/**
 * Hands each JSON line that the launcher writes to the private stdin pipe to
 * `handle`, for as long as the scope lasts. Unreadable lines are ignored, so
 * other message types can share the pipe.
 */
export const forwardParentMessages = (
  handle: (message: unknown) => Effect.Effect<void>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
    reader.on("line", (line) => Queue.offerUnsafe(lines, line));
    yield* Effect.addFinalizer(() => Effect.sync(() => reader.close()));
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.flatMap(Queue.take(lines), (line) => {
          const message = parseLine(line);
          return message === undefined ? Effect.void : handle(message);
        }),
      ),
    );
  });
