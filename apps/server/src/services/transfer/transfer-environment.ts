import { Effect, Layer } from "effect";
import { forEachParentCommand, type ParentChannel } from "../../desktop/parent-channel.js";
import { DatabaseBackup } from "./database-backup.js";
import { TransferFileGrants } from "./transfer-file-grants.js";

/**
 * The transfer services of the desktop server: grants arrive from Electron main on
 * the private stdin pipe when `parent` is given, and imports back up `databasePath`.
 * The grants service validates each grant again before recording it.
 */
export function transferEnvironmentLayer(
  databasePath: string,
  parent: ParentChannel["Service"] | undefined,
) {
  const grants = Layer.effectDiscard(
    Effect.gen(function* () {
      const files = yield* TransferFileGrants;
      if (parent !== undefined) {
        yield* forEachParentCommand(parent, (message) =>
          message.type === "transfer-file-grant" ? files.grant(message) : Effect.void,
        );
      }
    }),
  ).pipe(Layer.provideMerge(TransferFileGrants.layer));
  return Layer.merge(grants, DatabaseBackup.layer(databasePath));
}
