import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { addColumns, applyDdl } from "./apply-ddl.js";
import { reserveSearchKey, rewriteSavedSearches } from "./reserve-search-key.js";

const doneStatusId = "019A0000-0000-7000-8000-000000000204";

/** Workflow status references added to existing items. */
export const statusColumns = [
  "StatusId TEXT NULL REFERENCES StatusLevel (Id) ON DELETE RESTRICT",
  "ReopenStatusId TEXT NULL REFERENCES StatusLevel (Id) ON DELETE RESTRICT",
];

/** Priority number and its storage constraint. */
export const priorityNumberColumns = [
  `Number INTEGER
    CONSTRAINT CK_PriorityLevel_Number CHECK (Number IS NULL OR (typeof(Number) = 'integer' AND Number >= 1))`,
];

/** Status table and indexes, including the replacement for the original PriorityLevel name index. */
export const statusLookupSchema = [
  `CREATE TABLE StatusLevel (
    Id TEXT NOT NULL CONSTRAINT PK_StatusLevel PRIMARY KEY,
    Kind INTEGER NOT NULL CONSTRAINT CK_StatusLevel_Kind CHECK (Kind IN (0, 1)),
    Name TEXT NOT NULL COLLATE NOCASE,
    ColorKey TEXT NULL,
    IsBuiltIn INTEGER NOT NULL,
    IsArchived INTEGER NOT NULL,
    SortOrder INTEGER NOT NULL
)`,
  `CREATE UNIQUE INDEX IX_PriorityLevel_Name ON PriorityLevel (Name) WHERE Name <> ''`,
  `CREATE UNIQUE INDEX IX_PriorityLevel_Number ON PriorityLevel (Number)
    WHERE Number IS NOT NULL AND IsArchived = 0`,
  `CREATE UNIQUE INDEX IX_StatusLevel_Name ON StatusLevel (Name)`,
];

const inconsistentItemStatus = `(NEW.CompletedAtUtc IS NOT NULL) <>
    EXISTS (SELECT 1 FROM StatusLevel WHERE Id = NEW.StatusId AND Kind = 1)
OR (NEW.ReopenStatusId IS NOT NULL AND (NEW.CompletedAtUtc IS NULL OR
    NOT EXISTS (SELECT 1 FROM StatusLevel WHERE Id = NEW.ReopenStatusId AND Kind = 0)))`;

/** Indexes and constraints for status and completion. */
export const itemStatusSchema = [
  `CREATE INDEX IX_TodoItem_StatusId ON TodoItem (StatusId)`,
  `CREATE INDEX IX_TodoItem_ReopenStatusId ON TodoItem (ReopenStatusId)`,
  `CREATE TRIGGER TodoItem_Status_Insert BEFORE INSERT ON TodoItem
WHEN ${inconsistentItemStatus}
BEGIN SELECT RAISE(ABORT, 'Item status must agree with completion'); END`,
  `CREATE TRIGGER TodoItem_Status_Update BEFORE UPDATE OF StatusId, ReopenStatusId, CompletedAtUtc ON TodoItem
WHEN ${inconsistentItemStatus}
BEGIN SELECT RAISE(ABORT, 'Item status must agree with completion'); END`,
  `CREATE TRIGGER StatusLevel_Kind_Update BEFORE UPDATE OF Kind ON StatusLevel
WHEN NEW.Kind <> OLD.Kind
BEGIN SELECT RAISE(ABORT, 'Status kind cannot change'); END`,
  `CREATE TRIGGER StatusLevel_LastDone_Update BEFORE UPDATE OF IsArchived ON StatusLevel
WHEN NEW.IsArchived = 1 AND OLD.IsArchived = 0 AND OLD.Kind = 1
    AND NOT EXISTS (SELECT 1 FROM StatusLevel WHERE Kind = 1 AND IsArchived = 0 AND Id <> OLD.Id)
BEGIN SELECT RAISE(ABORT, 'At least one Done status must stay active'); END`,
  `CREATE TRIGGER StatusLevel_InUse_Delete BEFORE DELETE ON StatusLevel
WHEN EXISTS (SELECT 1 FROM TodoItem WHERE StatusId = OLD.Id OR ReopenStatusId = OLD.Id)
BEGIN SELECT RAISE(ABORT, 'This status is still used by an item'); END`,
  `CREATE TRIGGER StatusLevel_LastDone_Delete BEFORE DELETE ON StatusLevel
WHEN OLD.IsArchived = 0 AND OLD.Kind = 1
    AND NOT EXISTS (SELECT 1 FROM StatusLevel WHERE Kind = 1 AND IsArchived = 0 AND Id <> OLD.Id)
BEGIN SELECT RAISE(ABORT, 'At least one Done status must stay active'); END`,
];

/** Adds workflow and priority storage and upgrades legacy completion and query text. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* addColumns("PriorityLevel", priorityNumberColumns);
  yield* sql`DROP INDEX IX_PriorityLevel_Name`;
  yield* applyDdl(statusLookupSchema);
  yield* sql`INSERT INTO StatusLevel (Id, Kind, Name, IsBuiltIn, IsArchived, SortOrder) VALUES
    ('019A0000-0000-7000-8000-000000000201', 0, 'Queued', 0, 0, 0),
    ('019A0000-0000-7000-8000-000000000202', 0, 'In progress', 0, 0, 1),
    ('019A0000-0000-7000-8000-000000000203', 0, 'Testing', 0, 0, 2),
    (${doneStatusId}, 1, 'Completed', 0, 0, 3)`;
  yield* addColumns("TodoItem", statusColumns);
  yield* sql`UPDATE TodoItem SET StatusId = ${doneStatusId} WHERE CompletedAtUtc IS NOT NULL`;
  yield* applyDdl(itemStatusSchema);
  yield* reserveSearchKey("completed", true);
  yield* rewriteSavedSearches("status", "completed");
  yield* rewriteSavedSearches("__workflowstatus", "status");
});
