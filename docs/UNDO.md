# Recording undoable writes

WP26 records project, folder and item writes, including the existing direct
restores, hierarchy and completion cascades, sibling ordering and item custom
values. Each server session gets one `UndoService` with a 50-step history.
Settings saves record their rows with any reconciled items as one step. The step
context names the projects whose automatic completion it turned on, and replay
requires that transition and checks parent completion against current settings.

1. Use `undo.record` as the public operation's transaction wrapper. Complete
   validation inside it. For operations with a confirmation preview, capture in
   the request that actually applies the change.
2. Before the first write, call `undo.capture(label, sources)` once. Name the
   initiating action, such as `Complete 'Child'`. Select the full set of rows the
   action can insert, change or delete, including sibling order changes and
   reconciled parents. Predicates must select their rows on both sides of the
   write. For a move, include both areas. Include persisted user data from
   additional tables explicitly, as item edits do for `ItemFieldValue`.
3. Run repository writes on the same SQL client. The recorder diffs the
   selected rows and publishes through `SqlClient.afterCommit` while it still
   holds the history lease. Rollback, previews and timestamp-only changes
   produce no step.
4. Add `HISTORY_KEY` to that mutation's renderer reactivity keys, and
   `HISTORY_REPLAY_KEY` to queries that display replayed data. Register any
   replay-sensitive unsaved draft with `useUndoBlocker`. Test reads through
   a fresh operation after undo and redo, including refusal and rollback.

## Coverage audit (WP51)

Every public write operation at `legacy-final` maps to one history step or a documented
exclusion. Labels are the legacy `UndoLabels` text, with ⟨name⟩ the entity the user acted
on (a rename uses the new name). Each step captures its rows inside the operation's own
transaction, so a failed or refused operation records nothing.

Replay checks, in addition to SQLite's foreign keys and unique indexes:

- **R** compares every affected row, soft-deleted rows included, with the values the step
  left ("This ⟨subject⟩ changed since", or "was permanently deleted since").
- **D** requires every dependent of a hard-deleted row to be removed by the same step.
- **H** refuses to activate a row beneath a deleted ancestor or leave newer rows in a
  deleted branch.
- **C** checks ToDo parent completion against the effective settings the replay leaves (tickets follow their status, §6.1).
- **V** checks custom values against the current field type, scope and choice.
- **L** checks the final item type or priority list: Core's Unicode name rule including
  archived names, unique ranks and active priority numbers.
- **S** checks the final status list's names and ranks, the active Done status and
  statuses still used by items.
- **F** refuses a type change for a field that gained values, a field name now visible in
  the same project and a choice label now used by another active choice.
- **T** validates thresholds and requires each recorded automatic-completion transition.
- **Q** checks saved-search names with Core's case-insensitive comparison.

Server test files are in `apps/server/test/db/services/` unless they name `rpc/`.
Browser tests are in `apps/web/test/`.

| Operation (RPC) | Label | Undoable | Replay checks | Tests |
| --- | --- | --- | --- | --- |
| `CreateProject` | Create '⟨name⟩' | Yes | R, D | `undo-service` “Replays project and folder creation, renaming, moving and reordering with their action labels” |
| `RenameProject` | Rename '⟨name⟩' | Yes | R | same; `rpc/undo-rpc` “Replays project actions through RPC and reports refusals with the operation error union” |
| `ReorderProjects` | Reorder projects | Yes | R | `undo-service` “Replays project and folder creation, renaming, moving and reordering with their action labels” |
| `DeleteProject` | Delete '⟨name⟩' | Yes | R, H | `undo-service` “Replays project deletion and restoration as separate steps, retaining earlier batches”; `shell/history` “Restores a deleted project on Home and disables undo once its only action is undone” |
| `RestoreProject` | Restore '⟨name⟩' | Yes | R, H, C | `undo-service` “Replays project deletion and restoration as separate steps, retaining earlier batches” |
| `CreateFolder`, `RenameFolder`, `MoveFolder` | Create / Rename / Move '⟨name⟩' | Yes | R, D, H | `undo-service` “Replays project and folder creation, renaming, moving and reordering with their action labels” |
| `ReorderFolders` | Reorder folders | Yes | R | same |
| `DeleteFolder`, `RestoreFolder` | Delete / Restore '⟨name⟩' | Yes | R, H, C | `undo-service` “Replays folder deletion and restoration as separate steps, retaining earlier batches”, “Refuses to redo a folder deletion with newer active contents” |
| `CreateItem` | Create '⟨title⟩' | Yes | R, D, H, C | `undo-service` “Replays item creation, indentation, outdent and cross-area moves without losing descendants”, “Refuses to remove a created item with a newer link” |
| `EditItem` | Edit '⟨title⟩'; Set status of, Set repeat for or Stop repeating '⟨title⟩' | Yes | R, D, V, C | `undo-service` “Clearing a custom value and renaming are one step, including field-only edits”, “Refuses to resurrect a removed choice and rolls back the other row writes”; `item-links` “Link changes and field changes are one undo step”; `item-recurrence` “Setting, changing and removing a rule are labelled undo steps”; `reminder-service` “The editor saves the reminder choice and undo restores the previous one”; `editor/links-section` “Undo and redo of a saved link list reload the editor's links” |
| `AddItem` (§7.19) | Create '⟨title⟩' | Yes | R, D, H, C | `item-add` “Adds a ticket with its fields, levels and rank as one undo step”, “Undo refuses to remove a created ticket once it has a newer comment” |
| `EditItem` with ticket fields (§7.19) | Edit '⟨title⟩' | Yes | R | `item-add` “Edits a ticket's fields as one step and keeps an archived person already on it” |
| `AddTicketComment` (§7.19) | Add comment to '⟨title⟩' | Yes | R | `item-add` “Adds comments newest first and refuses comments and ticket fields on a ToDo” |
| `SetProjectIcon` (§7.19) | Change icon of '⟨name⟩' | Yes | R | `project-service` “Changing a project icon is one undo step and an invalid key changes nothing” |
| `AddTicketListEntry`, `RenameTicketListEntry`, `ArchiveTicketListEntry`, `RestoreTicketListEntry`, `ReorderTicketListEntries` (§7.19) | Add / Rename / Archive / Restore ⟨kind⟩ '⟨name⟩', such as Add module 'Train'; Reorder people, ticket types, applications, modules or interfaces | Yes | R, D | `ticket-list-service` “Adds an application, module and interface, each as one labelled undo step”, “Renames, archives, restores and reorders entries with their labels” |
| `SetItemCompleted` | Complete / Reopen '⟨title⟩' | Yes | R, C | `undo-service` “Completing the last child records and replays the whole cascade under the child's name”; `rpc/undo-rpc` “A completion preview leaves RPC history intact and the committed cascade replays together”; `shell/history` “Replays completion using Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z” |
| `SetItemStatus` | Set status of '⟨title⟩' | Yes | R, S, C | `item-status` “Status lookups and assignments can be undone and redone” |
| `SetItemPriority` | Set priority of '⟨title⟩' | Yes | R | `item-service` “Setting a priority changes only the priority and clears the ticket rank in one step”; `workspace/priority-menu` “Records the change in history so Edit undo restores the previous priority” |
| `MoveItemToPriorityGroup` | Set priority of / Move '⟨title⟩' | Yes | R, C | `item-priority-group-move` “Moving into another section sets priority and position in one undo step”, “Moving within the same section is labelled a move”; `workspace/card-grid` “Drops a card on the right third of a card in another section and one undo restores it” |
| `MoveItem`, `DropItem`, `MoveItemToArea`, `IndentItem`, `OutdentItem` | Move / Indent / Outdent '⟨title⟩' | Yes | R, H, C | `undo-service` “Replays item creation, indentation, outdent and cross-area moves without losing descendants” |
| `ReorderItems` | Reorder items | Yes | R | `shell/history` “Preserves selection and focus through reorder replay and clears the outcome on navigation” |
| `DeleteItem`, `RestoreItems` | Delete / Restore '⟨title⟩' | Yes | R, H, C | `undo-service` “Replays item deletion and restoration as separate steps, retaining earlier batches”, “Refuses to reactivate a row beneath a deleted folder”; `shell/history` “Undoes a keyboard deletion and clears the batch notice” |
| `PushBackOneDay` | Push back '⟨title⟩' | Yes | R | `item-push-back` “An interrupted push back saves nothing and keeps the history”; `workspace/push-back-one-day` “Records one undo step named after the item” |
| `SkipRepeat`, `StopRepeating` | Skip repeat for / Stop repeating '⟨title⟩' | Yes | R | `item-recurrence` “Skip moves the same row and undo restores the dates and the count” |
| `RescheduleCalendarEntry` | Reschedule '⟨title⟩' | Yes | R | `calendar-service` “A month drop keeps the latest due time and records one undoable date change”; `calendar/calendar-drag` “Restores an all-day entry's focus on Alt+Right and replays the calendar move” |
| `MoveTicket`, `SetTicketPriority` | Move / Set priority of '⟨title⟩' | Yes | R | `ticket-service` “Set priority appends and each change has one labelled undo step”, “Undo refuses a move whose tickets changed since and changes nothing”; `tickets/tickets-page` “Undo and redo replay a move on the board, and a refusal leaves it as it is” |
| `SnoozeReminder` | Snooze reminder for '⟨title⟩' | Yes | R (delivery marker ignored) | `reminder-service` “A snooze is undoable even after delivery changes the same row”, “A snooze is refused once the reminder changed or was not delivered”; `reminders/reminders-panel` “Snoozing from the menu clears the count and records an undoable step” |
| `RestoreTrashBatch` | Restore '⟨top node⟩' | Yes | R, H, C | `trash-service` “A repeated restore is refused and records no second step”; `rpc/trash-rpc` |
| `AddStatus`, `RenameStatus`, `ArchiveStatus`, `RestoreStatus`, `ReorderStatuses` | Add / Rename / Archive / Restore status '⟨name⟩'; Reorder statuses | Yes | R, D, S | `status-operations` “Each status list change is one labelled undo step”, “Redo refuses a rank now used by another status and keeps the step”, “Undo refuses an archived status name with different Unicode case” |
| `AddPriorityLevel`, `SetPriorityNumber` | Add / Edit priority '⟨label⟩' | Yes | R, D, L | `lookup-service` “Undoes and redoes a number edit and a new number-only priority”, “Refuses to redo a priority number claimed by another active level”, “Refuses to redo a PriorityLevel rank now used by an imported lookup” |
| `RenamePriorityLevel`, `ArchivePriorityLevel`, `RestorePriorityLevel`, `ReorderPriorityLevels` | Rename / Archive / Restore priority '⟨label⟩'; Reorder priority levels | Yes | R, L | `lookup-service` “Round-trips a priority %s and refuses to undo it after the row changed”, “Refuses to undo into a case-equivalent archived priority name”; `settings/lookup-list` “Ctrl+Z restores a priority after archiving it in App Settings” |
| `AddItemType`, `RenameItemType`, `ArchiveItemType`, `RestoreItemType`, `ReorderItemTypes` (WP51) | Add / Rename / Archive / Restore item type '⟨name⟩'; Reorder item types | Yes | R, D, L | `lookup-service` “Round-trips an item type %s and refuses to undo it after the row changed”, “Refuses to redo a ItemType rank now used by an imported lookup”, “Refuses to undo into a case-equivalent archived item type name”; `rpc/undo-rpc` “Undo after renaming an item type or a choice reverts that rename, not the step before”; `settings/lookup-list` “Names an item type rename in the Edit menu and Ctrl+Z restores the old name”, “Redoes an item type archive from the Edit menu and shows it archived again” |
| `CreateField`, `RenameField`, `ChangeFieldType`, `ArchiveField`, `RestoreField`, `ReorderFields` (WP51) | Add / Rename / Archive / Restore field '⟨name⟩'; Change type of field '⟨name⟩'; Reorder fields | Yes | R, D, F, V | `field-service` “Round-trips a field %s and refuses to undo it after the row changed”, “Refuses to redo a type change after the field gained values”, “Refuses to undo a rename when another visible field now uses the old name”, “Refuses to undo adding a field that an item now uses”; `rpc/undo-rpc` “A refused field replay keeps the RPC history position and reports a rule violation”; `settings/field-manager-card` “Names a field rename in the Edit menu and undoes it from there”, “Ctrl+Z brings back an archived field and Ctrl+Y archives it again” |
| `AddFieldChoice`, `RenameFieldChoice`, `ArchiveFieldChoice`, `RestoreFieldChoice`, `ReorderFieldChoices` (WP51) | Add / Rename / Archive / Restore choice '⟨label⟩'; Reorder choices | Yes | R, D, F, V | `field-service` “Round-trips a choice %s and refuses to undo it after the row changed”, “Refuses to redo restoring a choice whose label another active choice now uses”; `rpc/undo-rpc` “Undo after renaming an item type or a choice reverts that rename, not the step before”; `settings/field-manager-card` “Names a choice rename in the Edit menu and Ctrl+Z refreshes the open panel”, “Blocks undo while a new choice label is typed and leaves the choice unchanged” |
| `SaveGlobalSettings` (database preferences) | Edit global settings | Yes | R, T, C | `undo-service` “Records enabling automatic completion with its reconciliation as one step”, “Refuses to undo global thresholds that conflict with a newer project override”, “Saving unchanged global defaults writes nothing and keeps history”; `settings-service` “Saving reminder defaults writes only changed values in one undo step” |
| `SaveProjectSettings` | Edit project settings | Yes | R, T, C | `undo-service` “Undoes and redoes a project override with its reconciliation”, “Refuses to redo reconciliation when the project now opts out” |
| `SaveSavedSearch` (new or overwrite), `RenameSavedSearch`, `DeleteSavedSearch`, `ReorderSavedSearches` | Save search / Replace saved search / Rename saved search / Delete saved search '⟨name⟩'; Reorder saved searches | Yes | R, Q | `saved-search-service` “Records %s as one step that round trips and refuses a changed row”, “Refuses to undo deleting %s when another search took the name in another case meanwhile”; `search/saved-search-bar` “Undo removes a saved search from the chips” |

### Exclusions

These writes stay outside history, as at `legacy-final`. Each runs in its own transaction
behind the history gate where it can conflict with replay.

| Operation | Legacy reason | Tests |
| --- | --- | --- |
| Start with system, in `SaveGlobalSettings` | The OS sign-in entry is outside the database transaction and its update can fail independently. Its stored key is excluded from any mixed step. | `settings-service` “A startup-only bulk save does not record an undo step”, “Setting start with system on its own records no undo step”, “Undoing a mixed global save keeps the start-with-system preference” |
| `SetCurrentItem` | Legacy saves it without a label (§7.18: outside undo history). It points the tray card at the item being worked on rather than editing user data. | `current-item-service` “Choosing the current item records no undo step and is stored as legacy text” |
| `PurgeTrashBatch`, `EmptyTrash` | Intentional permanent removal, including owned data. A purge prevents replay of any soft delete or restore that needs those rows. | `trash-service` “Emptying the trash records no undo step and leaves the delete step unreplayable”; `undo-service` “Refuses undo after a purge and leaves the history cursor in place” |
| Reminder delivery (scheduler) | Delivery bookkeeping prevents repeated notifications. `ReminderDeliveredFor` is also ignored by row comparison. | `reminder-service` “The due query respects effective settings, visibility and delivery history”; `undo-service` “Replays FTS changes and preserves reminder delivery markers” |
| `DismissReminder` | Hides a delivered reminder for the session without changing stored data. | `reminders/reminders-panel` “Dismiss removes the entry and its count without recording history” |
| `ImportJson`, `ImportCsv` | Bulk additions use the pre-import database backup for recovery (§7.9). | `transfer/transfer-service` and `transfer/csv-import` “Records no undo step and keeps the previous one” |
| Seed and migrate | Initializes and upgrades storage outside user history. | `undo-service` “A reopened database retains committed rows and starts with empty history” |

Exports, previews and loads only read. Navigation, selection, theme and the sidebar's
width never reach the database.

### Renderer refresh

Every mutation of an undoable operation adds `HISTORY_KEY` to its reactivity keys, so the
Edit menu names the new step. Field and choice mutations still refresh only their own
lists, so other open choice panels keep their typed text. Queries that show replayable data
subscribe to `HISTORY_REPLAY_KEY`: projects, workspace areas, item values and links,
lookups and statuses, fields and choices, search metadata, saved searches, settings,
calendar, Today, Tickets, Trash and the current item card. The reminder stream follows
every committed replay. Pending lookup
names, priority numbers, new field names and choice labels, new ticket list names, settings
drafts and item editor drafts block undo through `useUndoBlocker`.

## Replay notes

Replay compares raw values of each affected row, including soft-deleted rows.
`UpdatedAtUtc` does not affect equality and `ReminderDeliveredFor` is excluded.
The hard-delete guard checks foreign keys into removed rows, including cascades.
The derived FTS mapping and index follow their SQLite triggers. If a later
migration adds a user-data table, add its primary key to `undo-rows.ts` before
recording it, and extend replay validation for any rules SQLite cannot enforce.
The checks R to Q above live in `apps/server/src/db/undo/replay-*.ts`.
