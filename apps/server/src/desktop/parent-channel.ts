import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { DesktopToServerMessage, ServerToDesktopMessage } from "@task-tracker/contracts";
import { Context, Effect, Latch, Option, PubSub, Queue, Schema } from "effect";

type Outgoing = typeof ServerToDesktopMessage.Type;
type Incoming = typeof DesktopToServerMessage.Type;

/** Longer lines from the launcher are ignored; a grant's path is at most 4,096 characters. */
const MAX_LINE_LENGTH = 16_384;

const decodeIncoming = Schema.decodeUnknownOption(Schema.fromJsonString(DesktopToServerMessage));
const encodeOutgoing = Schema.encodeSync(Schema.fromJsonString(ServerToDesktopMessage));

/** Decodes one launcher line, or none for anything that is not a known message. */
export function decodeParentLine(line: string): Option.Option<Incoming> {
  return line.length > MAX_LINE_LENGTH ? Option.none() : decodeIncoming(line);
}

/**
 * The private pipes between the server and Electron main (§4). The server
 * writes JSON lines after its readiness line and reads JSON lines from stdin,
 * which also signals the launcher's exit by closing. Every launcher message
 * shares the one stdin reader; each consumer subscribes to the messages it needs.
 */
export class ParentChannel extends Context.Service<
  ParentChannel,
  {
    /** Queues a message. Messages are written in order once {@link markReady} has run. */
    readonly send: (message: Outgoing) => Effect.Effect<void>;
    /** Releases queued messages after the readiness line has been written. */
    readonly markReady: Effect.Effect<void>;
    /** Validated messages from the launcher, published to every subscriber. */
    readonly commands: PubSub.PubSub<Incoming>;
  }
>()("TaskTracker/ParentChannel") {}

/** Writes each queued message as one line once the channel is ready. */
const writeMessages = (outgoing: Queue.Dequeue<Outgoing>, output: Writable) =>
  Effect.forever(
    Effect.flatMap(Queue.take(outgoing), (message) =>
      Effect.sync(() => output.write(`${encodeOutgoing(message)}\n`)),
    ),
  );

/** Publishes each valid launcher line to `incoming` until the scope closes. */
const readCommands = (input: Readable, incoming: PubSub.PubSub<Incoming>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
      lines.on("line", (line) => {
        Option.map(decodeParentLine(line), (message) => PubSub.publishUnsafe(incoming, message));
      });
      return lines;
    }),
    (lines) => Effect.sync(() => lines.close()),
  );

/** Builds a parent channel over the given streams, for stdio or tests. */
export const makeParentChannel = Effect.fnUntraced(function* (input: Readable, output: Writable) {
  const outgoing = yield* Queue.unbounded<Outgoing>();
  const incoming = yield* PubSub.unbounded<Incoming>();
  const ready = yield* Latch.make(false);
  yield* readCommands(input, incoming);
  yield* Effect.forkScoped(Effect.andThen(ready.await, writeMessages(outgoing, output)));
  return ParentChannel.of({
    send: (message) => Queue.offer(outgoing, message).pipe(Effect.asVoid),
    markReady: ready.open.pipe(Effect.asVoid),
    commands: incoming,
  });
});

/**
 * Runs `handle` for each launcher message until the scope closes. It subscribes
 * before returning, so every message main sends after the readiness line arrives.
 */
export const forEachParentCommand = Effect.fnUntraced(function* (
  channel: ParentChannel["Service"],
  handle: (message: Incoming) => Effect.Effect<void>,
) {
  const subscription = yield* PubSub.subscribe(channel.commands);
  yield* Effect.forkScoped(Effect.forever(Effect.flatMap(PubSub.take(subscription), handle)));
});
