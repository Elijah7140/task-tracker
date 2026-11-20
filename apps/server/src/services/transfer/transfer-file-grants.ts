import { isAbsolute } from "node:path";
import { TransferFileGrant } from "@task-tracker/contracts";
import { Context, Deferred, Duration, Effect, Layer, Option, Schema } from "effect";
import { TransferFileError } from "./transfer-file-error.js";

/** A path Electron main granted for one transfer, for reading or writing. */
export type FileGrant = typeof TransferFileGrant.Type;

/** How long a request waits for a grant that main wrote just before answering the renderer. */
const ARRIVAL_WAIT = Duration.seconds(5);

/** The most grants remembered; the oldest is forgotten first. */
const MAX_GRANTS = 64;

const NOT_GRANTED = "Choose the file again in Task Tracker; this file choice is no longer valid.";

const decodeGrant = Schema.decodeUnknownOption(TransferFileGrant);

/** True for an absolute path to a `.json` file, the only kind a grant may name. */
export function isTransferPath(path: string): boolean {
  return isAbsolute(path) && /\.json$/i.test(path) && !path.includes("\0");
}

const make = Effect.sync(() => {
  const pending = new Map<string, Deferred.Deferred<FileGrant>>();

  const slot = Effect.fnUntraced(function* (token: string) {
    const existing = pending.get(token);
    if (existing !== undefined) {
      return existing;
    }
    const created = yield* Deferred.make<FileGrant>();
    pending.set(token, created);
    if (pending.size > MAX_GRANTS) {
      pending.delete(pending.keys().next().value!);
    }
    return created;
  });

  /** Records a grant from main. Malformed grants and paths are ignored. */
  const grant = Effect.fnUntraced(function* (message: unknown) {
    const decoded = decodeGrant(message);
    if (Option.isNone(decoded) || !isTransferPath(decoded.value.path)) {
      return yield* Effect.logWarning("Ignored an invalid transfer file grant");
    }
    yield* Deferred.succeed(yield* slot(decoded.value.token), decoded.value);
  });

  /**
   * The path behind a token, for the given access. Write grants and consumed read
   * grants are forgotten, so a token works for one export or one import only.
   */
  const path = Effect.fnUntraced(function* (
    token: string,
    access: FileGrant["access"],
    consume: boolean,
  ) {
    const found = yield* Deferred.await(yield* slot(token)).pipe(
      Effect.timeoutOption(ARRIVAL_WAIT),
    );
    if (Option.isNone(found) || found.value.access !== access) {
      pending.delete(token);
      return yield* Effect.fail(new TransferFileError(NOT_GRANTED));
    }
    if (consume || access === "write") {
      pending.delete(token);
    }
    return found.value.path;
  });

  return { grant, path };
});

/**
 * The files the user chose in Electron's dialogs, by token (§4, §7.9). The renderer
 * can name a token but never a path, so it cannot make the server read or write
 * anything the user did not pick.
 */
export class TransferFileGrants extends Context.Service<TransferFileGrants>()(
  "@task-tracker/server/TransferFileGrants",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
