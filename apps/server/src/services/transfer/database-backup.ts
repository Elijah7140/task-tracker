import { Context, Effect, Layer } from "effect";
import { backupDatabaseForImport } from "../../db/backup-database.js";
import { TransferFileError } from "./transfer-file-error.js";

/** Takes the copy of the database that an import saves first (§7.9). */
export interface DatabaseBackupShape {
  /** Copies the committed database and returns the backup's path. */
  readonly createImportBackup: Effect.Effect<string, TransferFileError>;
}

const failed = (cause: unknown) =>
  new TransferFileError(
    `The database backup could not be made, so nothing was imported: ${cause instanceof Error ? cause.message : String(cause)}`,
  );

/** The pre-import backup service. The live layer copies the open database file. */
export class DatabaseBackup extends Context.Service<DatabaseBackup, DatabaseBackupShape>()(
  "@task-tracker/server/DatabaseBackup",
) {
  /** Backs up the database file at `path`, or fails for a database without a file. */
  static layer(path: string | null): Layer.Layer<DatabaseBackup> {
    return Layer.succeed(this, {
      createImportBackup:
        path === null
          ? Effect.fail(failed(new Error("The database has no file to copy.")))
          : backupDatabaseForImport(path).pipe(Effect.mapError(failed)),
    });
  }
}
