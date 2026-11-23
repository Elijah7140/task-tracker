import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import addCustomFields from "./add-custom-fields.js";
import addInProgressStatuses from "./add-in-progress-statuses.js";
import addItemLinks from "./add-item-links.js";
import addItemNotes from "./add-item-notes.js";
import addItemSearch from "./add-item-search.js";
import addRecurrence from "./add-recurrence.js";
import addReminders from "./add-reminders.js";
import addSavedSearches from "./add-saved-searches.js";
import addStatusesAndPriorityNumbers from "./add-statuses-and-priority-numbers.js";
import addTicketRank from "./add-ticket-rank.js";
import addTickets from "./add-tickets.js";
import dropItemSchedule from "./drop-item-schedule.js";
import dropTicketExtraFields from "./drop-ticket-extra-fields.js";
import reserveTicketSearchKeys from "./reserve-ticket-search-keys.js";
import indexTodayCompletions from "./index-today-completions.js";
import initialCreate from "./initial-create.js";

/** The legacy schema stages in Effect migration order. */
export const databaseMigrations = Migrator.fromRecord({
  "1_InitialCreate": initialCreate,
  "2_AddCustomFields": addCustomFields,
  "3_AddItemSearch": addItemSearch,
  "4_AddSavedSearches": addSavedSearches,
  "5_AddItemLinks": addItemLinks,
  "6_AddRecurrence": addRecurrence,
  "7_AddReminders": addReminders,
  "8_IndexTodayCompletions": indexTodayCompletions,
  "9_AddStatusesAndPriorityNumbers": addStatusesAndPriorityNumbers,
  "10_AddTicketRank": addTicketRank,
  "11_AddTickets": addTickets,
  "12_ReserveTicketSearchKeys": reserveTicketSearchKeys,
  "13_AddInProgressStatuses": addInProgressStatuses,
  "14_DropItemSchedule": dropItemSchedule,
  "15_DropTicketExtraFields": dropTicketExtraFields,
  "16_AddItemNotes": addItemNotes,
});

/** Records the validated EF stages and applies any remaining migrations in the same transaction. */
export const migrateFromEf = (efStage: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const loader = Effect.map(databaseMigrations, (migrations) =>
      migrations.map(
        ([id, name, load]) =>
          [id, name, id <= efStage ? Effect.succeed(Effect.void) : load] as const,
      ),
    );
    // Include creation of the migration ledger in the same transaction as the schema.
    return yield* sql.withTransaction(Migrator.make({})({ loader }));
  }).pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN IMMEDIATE"));

/** Applies pending Effect migrations to a fresh or Effect-managed database. */
export const migrate = migrateFromEf(0);
