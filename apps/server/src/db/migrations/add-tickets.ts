import { Effect } from "effect";
import { addColumns, applyDdl } from "./apply-ddl.js";

/** The item kind (§7.19). Existing items stay ToDos; a ticket always has a number. */
export const itemKindColumns = [
  `ItemKind TEXT NOT NULL DEFAULT 'Todo'
    CONSTRAINT CK_TodoItem_ItemKind CHECK (ItemKind IN ('Todo', 'Ticket') AND (ItemKind = 'Todo' OR TicketNumber IS NOT NULL))`,
];

/** The optional project icon key (§7.19). */
export const projectIconColumns = ["IconKey TEXT NULL"];

const listReference = "TEXT NULL REFERENCES TicketListEntry (Id) ON DELETE RESTRICT";

/** The ticket lists, the fixed ticket fields and the comment log (§7.19). */
export const ticketSchema = [
  `CREATE TABLE TicketListEntry (
    Id TEXT NOT NULL CONSTRAINT PK_TicketListEntry PRIMARY KEY,
    ListKind TEXT NOT NULL
      CONSTRAINT CK_TicketListEntry_ListKind CHECK (ListKind IN ('Person', 'TicketType', 'Application', 'Module', 'Interface')),
    ParentId TEXT NULL REFERENCES TicketListEntry (Id) ON DELETE RESTRICT,
    Name TEXT NOT NULL,
    IsArchived INTEGER NOT NULL,
    SortOrder INTEGER NOT NULL,
    CONSTRAINT CK_TicketListEntry_Parent CHECK ((ListKind IN ('Module', 'Interface')) = (ParentId IS NOT NULL))
)`,
  `CREATE UNIQUE INDEX IX_TicketListEntry_Name ON TicketListEntry (ListKind, IFNULL(ParentId, ''), Name COLLATE NOCASE)`,
  `CREATE INDEX IX_TicketListEntry_ParentId ON TicketListEntry (ParentId)`,
  `CREATE TABLE TicketDetail (
    ItemId TEXT NOT NULL CONSTRAINT PK_TicketDetail PRIMARY KEY
      REFERENCES TodoItem (Id) ON DELETE CASCADE,
    RequestorId ${listReference},
    ApplicationId ${listReference},
    ModuleId ${listReference},
    InterfaceId ${listReference},
    DispatchedToId ${listReference},
    PendingPersonId ${listReference},
    TicketTypeId ${listReference},
    Version TEXT NULL,
    EstimatedHours REAL NULL
      CONSTRAINT CK_TicketDetail_EstimatedHours CHECK (EstimatedHours IS NULL OR EstimatedHours >= 0),
    PercentComplete INTEGER NULL
      CONSTRAINT CK_TicketDetail_PercentComplete CHECK (PercentComplete IS NULL OR PercentComplete BETWEEN 0 AND 100),
    IsUrgent INTEGER NOT NULL,
    IsSystemOutage INTEGER NOT NULL
)`,
  `CREATE INDEX IX_TicketDetail_DispatchedToId ON TicketDetail (DispatchedToId)`,
  `CREATE TABLE TicketComment (
    Id TEXT NOT NULL CONSTRAINT PK_TicketComment PRIMARY KEY,
    ItemId TEXT NOT NULL REFERENCES TodoItem (Id) ON DELETE CASCADE,
    Body TEXT NOT NULL,
    CreatedAtUtc TEXT NOT NULL
)`,
  `CREATE INDEX IX_TicketComment_ItemId_CreatedAtUtc ON TicketComment (ItemId, CreatedAtUtc)`,
];

/** Adds the item kind, project icons and the ticket tables. */
export default Effect.gen(function* () {
  yield* addColumns("TodoItem", itemKindColumns);
  yield* addColumns("Project", projectIconColumns);
  yield* applyDdl(ticketSchema);
});
