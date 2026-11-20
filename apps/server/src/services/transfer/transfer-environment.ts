import { Effect, Layer } from "effect";
import { forwardParentMessages } from "../../parent-messages.js";
import { DatabaseBackup } from "./database-backup.js";
import { TransferFileGrants } from "./transfer-file-grants.js";

function isGrantMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "transfer-file-grant"
  );
}

/**
 * The transfer services of the desktop server: grants arrive from Electron main on
 * the private stdin pipe when `listen` is true, and imports back up `databasePath`.
 */
export function transferEnvironmentLayer(databasePath: string, listen: boolean) {
  const grants = Layer.effectDiscard(
    Effect.gen(function* () {
      const files = yield* TransferFileGrants;
      if (listen) {
        yield* forwardParentMessages((message) =>
          isGrantMessage(message) ? files.grant(message) : Effect.void,
        );
      }
    }),
  ).pipe(Layer.provideMerge(TransferFileGrants.layer));
  return Layer.merge(grants, DatabaseBackup.layer(databasePath));
}
