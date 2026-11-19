# Recording undoable writes

WP26 records project, folder and item writes, including the existing direct
restores, hierarchy and completion cascades, sibling ordering and item custom
values. Each server session gets one `UndoService` with a 50-step history.

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

| Later work | Rows to capture and replay considerations |
| --- | --- |
| WP27–28, WP51 lookups | Lookup rows affected by an add, edit, archive or reorder, plus item status and completion cascades. Validate final lookup uniqueness, ranks, active numbers and status dependencies. |
| WP31 saved searches | The affected saved-search rows, including ranks changed by a reorder. |
| WP33–35 calendar, drag and Trash | Item dates, changed hierarchy and ranks, or the full restored deletion batch and reconciled parents. Purge and Empty use normal transactions and can make a step permanently unavailable. |
| WP36–39 editor, links, recurrence and reminders | Markdown stays in the existing item edit. Capture link rows and affected item rows in the same editor save. Include recurrence successors, completion cascades and snooze choices where applicable. Delivery writes leave history alone. |
| WP43–47 work views | Capture the pushed or reprioritized item, affected dates, completion, ticket ranks or item order as applicable. Read-only views subscribe to the replay key. Session-only selection and current-item commands need no database step. |
| WP48–49 transfer | Imports use a pre-import backup. Exports read data. Neither records history. |
| WP51–52 fields and settings | Capture affected definition, choice and settings rows. Include reconciled item changes and validate the effective settings transition on replay. A mixed settings save excludes the start-with-system key. |

Replay compares raw values of each affected row, including soft-deleted rows.
`UpdatedAtUtc` does not affect equality and `ReminderDeliveredFor` is excluded.
The hard-delete guard checks foreign keys into removed rows, including cascades.
The derived FTS mapping and index follow their SQLite triggers. If a later
migration adds a user-data table, add its primary key to `undo-rows.ts` before
recording it, and extend replay validation for any rules SQLite cannot enforce.
