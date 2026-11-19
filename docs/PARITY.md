# TypeScript parity evidence

WP23 maps the pre-cutover desktop behavior to TypeScript tests. The references
are test titles as declared in source. Browser tests use Chromium and simulated
input. Desktop smoke uses the packaged Electron executable and isolated databases.

## Shortcuts and gestures

| Legacy interaction | TypeScript evidence |
| --- | --- |
| Enter on a focused project card and pointer open | [home-page.browser.test.tsx](../apps/web/test/home/home-page.browser.test.tsx) — “Opens a focused project card with Enter”, “Opens a project when its card is clicked” |
| Opening a project focuses quick-add | [project-page.browser.test.tsx](../apps/web/test/workspace/project-page.browser.test.tsx) — “Focuses quick-add when a project opens but not when moving between its folders” |
| Enter in quick-add creates an item | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Quick-adds a top-level item on Enter, selects it, and keeps quick-add focused” |
| Ctrl+N focuses quick-add | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Focuses quick-add from anywhere in the workspace with Ctrl+N” |
| Ctrl+Shift+N creates a sub-item through a prompt | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Adds a sub-item with Ctrl+Shift+N, expands the parent, and focuses the new child” |
| Space toggles completion and clicking the completion control also toggles | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Completes and reopens a leaf item via click and Space” |
| F2 edits the selected item's title with the current title selected | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Renames a focused item with F2 and validates blank names” |
| Delete asks before deleting the selected item | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Confirms deletion with Delete, supports Undo restore, and auto-dismisses the undo banner” |
| Alt+Up and Alt+Down reorder items | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Reorders top-level and nested open siblings with Alt+Up/Down while keeping finished slots” |
| Folder selection, expansion and keyboard navigation | [sidebar-folder-tree.browser.test.tsx](../apps/web/test/shell/sidebar-folder-tree.browser.test.tsx) — “Opens a folder's area when its row is clicked”, “Moves with the arrow keys and opens the focused folder with Enter”, “Collapses with Left, moves to the parent with Left and expands with Right” |
| Expand completed items and sub-items | [item-tree.browser.test.tsx](../apps/web/test/workspace/item-tree.browser.test.tsx) — “Lists completed items newest first when the section is expanded”, “Shows sub-items and an n completed section when a parent's chevron is clicked” |
| Right-click an item or folder for actions | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Opens item actions via right-click context menu and Shift+F10”. [workspace-smoke.test.ts](../apps/desktop/test/workspace-smoke.test.ts) — “Creates folders from the sidebar and a folder's context menu, and an item in a folder, that persist after relaunch” |
| Enter adds a lookup | [lookup-list.browser.test.tsx](../apps/web/test/settings/lookup-list.browser.test.tsx) — “Adds an item type with Enter and a priority level with Add, clearing each input” |
| Enter adds a custom field or choice | [field-manager-card.browser.test.tsx](../apps/web/test/settings/field-manager-card.browser.test.tsx) — “Adds a field of each type with Enter and the Add button, keeping the chosen type”, “Adds choices with Enter and the Add choice button and clears only that box” |
| Keyboard selects a field type | [field-manager-card.browser.test.tsx](../apps/web/test/settings/field-manager-card.browser.test.tsx) — “Changes a type with the keyboard” |
| ArrowUp and ArrowDown step thresholds | [app-settings.browser.test.tsx](../apps/web/test/settings/app-settings.browser.test.tsx) — “Steps threshold amounts with ArrowUp and ArrowDown without going below zero”. [project-settings.browser.test.tsx](../apps/web/test/settings/project-settings.browser.test.tsx) — “Steps an overridden threshold with arrow keys and stops at zero” |

## Dialogs

| Legacy dialog or response | TypeScript evidence |
| --- | --- |
| Text prompt accepts Enter and cancels with Escape | [dialog-host.browser.test.tsx](../apps/web/test/dialogs/dialog-host.browser.test.tsx) — “Replaces the selected initial text with what the user types”, “Resolves a prompt with null when Escape cancels it” |
| Confirmation accepts Enter and cancels with Escape | [dialog-host.browser.test.tsx](../apps/web/test/dialogs/dialog-host.browser.test.tsx) — “Confirms with Enter because focus starts on the confirm button”, “Answers no when Escape closes a confirmation” |
| Unsaved item draft offers Save, Discard and Cancel, with Enter to save and Escape to cancel | [draft-dialog.browser.test.tsx](../apps/web/test/dialogs/draft-dialog.browser.test.tsx) — “Saves with Enter because focus starts on the Save button”, “Discards when Discard is clicked”, “Cancels when Cancel is clicked”, “Cancels when Escape closes it” |
| Folder destination picker accepts Enter and cancels with Escape | [sidebar-folder-tree.browser.test.tsx](../apps/web/test/shell/sidebar-folder-tree.browser.test.tsx) — “Chooses a destination with the arrow keys and confirms with Enter”, “Leaves the folders unchanged when the move dialog is cancelled” |
| Messages dismiss with Enter or Escape | [dialog-host.browser.test.tsx](../apps/web/test/dialogs/dialog-host.browser.test.tsx) — “Dismisses a message with %s” (Enter and Escape) |
| New project, Rename project and Delete project | [home-page.browser.test.tsx](../apps/web/test/home/home-page.browser.test.tsx) — “Creates a project when Enter submits the New project dialog”, “Cancels project creation with Escape without calling the server”, “Renames a project from its card menu”, “Keeps the project name when a rename is cancelled”, “Deletes a project after the user confirms”, “Keeps a project when the delete is declined with Escape” |
| Project unavailable and Project action failed | [project-page.browser.test.tsx](../apps/web/test/workspace/project-page.browser.test.tsx) — “Returns home with a message when a linked project does not exist”. [home-page.browser.test.tsx](../apps/web/test/home/home-page.browser.test.tsx) — “Shows a project action failure when a project disappears during rename” |
| New folder, Rename folder and Delete folder | [sidebar-folder-tree.browser.test.tsx](../apps/web/test/shell/sidebar-folder-tree.browser.test.tsx) — “Creates a sub-folder from a folder's menu and expands its parent”, “Renames a folder from its context menu”, “Deletes the open folder after confirmation and opens its parent”, “Keeps a folder when the delete is declined” |
| Folder action failed | [sidebar-folder-tree.browser.test.tsx](../apps/web/test/shell/sidebar-folder-tree.browser.test.tsx) — “Shows the server's message and keeps the folder when a move would create a cycle” |
| New sub-item and Delete item | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Adds a sub-item with Ctrl+Shift+N, expands the parent, and focuses the new child”, “Confirms deletion with Delete, supports Undo restore, and auto-dismisses the undo banner” |
| Complete sub-items and Cannot reopen item | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Asks before completing a parent with open sub-items and obeys Cancel and Complete”, “Shows the blocked message when reopening a finished parent under auto-complete” |
| Item action failed | [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Shows the server error and preserves the quick-add draft when a title is rejected” |
| Item validation, rendered inline in the editor | [item-editor.browser.test.tsx](../apps/web/test/editor/item-editor.browser.test.tsx) — “Shows a refused title inline and stores nothing”, “Saving from the question with an invalid number shows why and stays open” |
| Turn on auto-complete with reconciliation in app and project settings | [app-settings.browser.test.tsx](../apps/web/test/settings/app-settings.browser.test.tsx) — “Prompts to reconcile when enabling auto-complete with disagreements and saves only on confirm”. [project-settings.browser.test.tsx](../apps/web/test/settings/project-settings.browser.test.tsx) — “Prompts for reconciliation when enabling auto-complete override and persists nothing on cancel” |
| Discard unsaved settings on Back | [app-settings.browser.test.tsx](../apps/web/test/settings/app-settings.browser.test.tsx) — “Offers only Discard and Cancel for unsaved defaults, as legacy Back did”. [project-settings.browser.test.tsx](../apps/web/test/settings/project-settings.browser.test.tsx) — “Offers only Discard and Cancel for unsaved overrides, as legacy Back did” |
| Rename item type or priority and Lookup validation | [lookup-list.browser.test.tsx](../apps/web/test/settings/lookup-list.browser.test.tsx) — “Renames a lookup through the prompt dialog and ignores Escape cancel”, “Rejects duplicate and blank names with a dialog while keeping the typed text” |
| Rename field, Rename choice and Field validation | [field-manager-card.browser.test.tsx](../apps/web/test/settings/field-manager-card.browser.test.tsx) — “Renames a field through the prompt and ignores a cancelled prompt”, “Renames a choice through the prompt”, “Rejects blank and duplicate names with a dialog and keeps the typed text”, “Refuses a type change for a field with values and shows the saved type again”, “Rejects a duplicate choice label and keeps it in the box” |

## Snapshots

Each row has light and dark Linux and Windows Chromium baselines from the 1440×900
browser viewport.
Home, workspace and app settings also have reviewed full-shell 1920×1080 images
named with `-1080p-`. The workspace uses seeded open items and an expanded Completed
section in both sizes. The existing snapshot files were preserved.

| Legacy snapshot | TypeScript evidence |
| --- | --- |
| Home with projects (`home`) | [home-page.browser.test.tsx](../apps/web/test/home/home-page.browser.test.tsx) — “Matches the reviewed home baseline” |
| Workspace with items (`workspace`) | [project-page.browser.test.tsx](../apps/web/test/workspace/project-page.browser.test.tsx) — “Matches the reviewed workspace baseline” |
| App settings (`app-settings`) | [app-settings.browser.test.tsx](../apps/web/test/settings/app-settings.browser.test.tsx) — “Matches the reviewed app settings baseline” |
| Project settings (`project-settings`) | [project-settings.browser.test.tsx](../apps/web/test/settings/project-settings.browser.test.tsx) — “Matches the reviewed project settings baseline” |
| Workspace with invalid custom number (`workspace-invalid-number`) | [item-editor.browser.test.tsx](../apps/web/test/editor/item-editor.browser.test.tsx) — “Matches the reviewed invalid custom number baseline” |
| Field manager with archived rows (`field-manager-archived`) | [field-manager-card.browser.test.tsx](../apps/web/test/settings/field-manager-card.browser.test.tsx) — “Matches the reviewed archived field manager baseline” |
| Priority lookup list (`lookup`) | [lookup-list.browser.test.tsx](../apps/web/test/settings/lookup-list.browser.test.tsx) — “Matches the reviewed lookup list baseline” |
| New project (`new-project`) | [dialog-host.browser.test.tsx](../apps/web/test/dialogs/dialog-host.browser.test.tsx) — “Matches the reviewed name prompt baseline” |
| Delete confirmation (`confirm-delete`) | [dialog-host.browser.test.tsx](../apps/web/test/dialogs/dialog-host.browser.test.tsx) — “Matches the reviewed delete confirmation baseline” |
| Unsaved item draft (`unsaved-draft`) | [item-editor.browser.test.tsx](../apps/web/test/editor/item-editor.browser.test.tsx) — “Matches the reviewed unsaved draft baseline” |
| Folder picker (`folder-picker`) | [dialog-host.browser.test.tsx](../apps/web/test/dialogs/dialog-host.browser.test.tsx) — “Matches the reviewed choice dialog baseline” |
| Message (`message`) | [dialog-host.browser.test.tsx](../apps/web/test/dialogs/dialog-host.browser.test.tsx) — “Matches the reviewed message baseline” |

## Packaged desktop smoke

Workflow numbers follow the declaration order in
`tests/TaskTracker.App.Desktop.SmokeTests/SmokeTests.cs` at `158a00f`, before cutover.

| Legacy workflow | TypeScript evidence |
| --- | --- |
| 1. Create five custom field types and persist the item values | [editor-smoke.test.ts](../apps/desktop/test/editor-smoke.test.ts) — “Creates all five custom field types and keeps their saved item values after relaunch” |
| 2. Create a project from Home and see its card | [main.test.ts](../apps/desktop/test/main.test.ts) — “Starts one sandboxed instance and persists a project after clean shutdown” |
| 3. Open project, focus quick-add and create an item | [workspace-smoke.test.ts](../apps/desktop/test/workspace-smoke.test.ts) — “Opening a project focuses quick-add and its new item persists after relaunch” |
| 4. Complete the only sub-item and see its parent complete | [workspace-smoke.test.ts](../apps/desktop/test/workspace-smoke.test.ts) — “Completing the only sub-item completes its parent and both stay completed after relaunch” |
| 5. Create a folder through the context menu and add an item in a folder | [workspace-smoke.test.ts](../apps/desktop/test/workspace-smoke.test.ts) — “Creates folders from the sidebar and a folder's context menu, and an item in a folder, that persist after relaunch” |
| 6. Save an edited title and see the row update | [editor-smoke.test.ts](../apps/desktop/test/editor-smoke.test.ts) — “Saving an edited title updates the item row and the new title persists after relaunch” |
| 7. Delete an item and see its row disappear after confirmation | [workspace-smoke.test.ts](../apps/desktop/test/workspace-smoke.test.ts) — “Deleting an item with confirmation removes its row, also after relaunch” |
| 8. Save an app threshold and see it after reopening settings | [settings-smoke.test.ts](../apps/desktop/test/settings-smoke.test.ts) — “Saving an app threshold persists after reopening settings and after relaunch” |
| 9. Cancel New project with Escape | [settings-smoke.test.ts](../apps/desktop/test/settings-smoke.test.ts) — “Escape cancels the new-project dialog” |
| Phase 3 database continuity | [fixture-smoke.test.ts](../apps/desktop/test/fixture-smoke.test.ts) — “Reads and edits a disposable copy of the Phase 3 EF fixture across relaunch”. The test checks hierarchy and completion, reads all five stored custom values, updates the estimate, verifies values after relaunch and checks the original fixture hash and absence of SQLite sidecars. |

## Accepted UI deviations

| Decision | TypeScript evidence |
| --- | --- |
| The item editor is a floating modal opened from the row context menu, overflow menu or Enter. F2 opens the title rename prompt. | [item-editor.browser.test.tsx](../apps/web/test/editor/item-editor.browser.test.tsx) — “Opens from the row context menu with the item's built-in values”, “Opens from the row overflow menu”, “Opens with Enter on a focused row and focuses the title”. [item-actions.browser.test.tsx](../apps/web/test/workspace/item-actions.browser.test.tsx) — “Renames a focused item with F2 and validates blank names” |
| The draft question names the item in “Save your changes to ‘…’ before continuing?” and defaults to Save. | [draft-dialog.browser.test.tsx](../apps/web/test/dialogs/draft-dialog.browser.test.tsx) — “Describes what will be saved”, “Saves with Enter because focus starts on the Save button”. [item-editor.browser.test.tsx](../apps/web/test/editor/item-editor.browser.test.tsx) — “Asks before closing with Escape when the draft changed” |
| Date fields use native date inputs, with clear buttons where applicable. | [custom-fields-section.browser.test.tsx](../apps/web/test/editor/custom-fields-section.browser.test.tsx) — “The clear button removes a stored date when saved”. [editor-smoke.test.ts](../apps/desktop/test/editor-smoke.test.ts) — “Creates all five custom field types and keeps their saved item values after relaunch” |
| Save errors appear inline and the editor retains the draft. | [item-editor.browser.test.tsx](../apps/web/test/editor/item-editor.browser.test.tsx) — “Shows a refused title inline and stores nothing”, “Saving from the question with an invalid number shows why and stays open”. [custom-fields-section.browser.test.tsx](../apps/web/test/editor/custom-fields-section.browser.test.tsx) — “Shows the server's rule message for a field archived elsewhere and keeps the draft” |
| A single click opens the project card. Enter also opens it. | [home-page.browser.test.tsx](../apps/web/test/home/home-page.browser.test.tsx) — “Opens a project when its card is clicked”, “Opens a focused project card with Enter” |
| Back in app and project settings keeps the legacy Discard/Cancel question for unsaved settings. | [app-settings.browser.test.tsx](../apps/web/test/settings/app-settings.browser.test.tsx) — “Offers only Discard and Cancel for unsaved defaults, as legacy Back did”. [project-settings.browser.test.tsx](../apps/web/test/settings/project-settings.browser.test.tsx) — “Offers only Discard and Cancel for unsaved overrides, as legacy Back did” |

## Sign-off checklist

| Evidence | Status |
| --- | --- |
| Linux baselines | Six new 1920×1080 images reviewed in light and dark. |
| Linux packaged smoke | 20 tests passed on each of three consecutive runs under Xvfb. |
| Windows baselines | Regenerated and reviewed all 48 Windows Chromium images against Linux at `fe975de`. The set covers 42 captures from the 1440×900 viewport and six full-shell 1920×1080 captures in light and dark. Layout and theme colours matched, with expected text antialiasing and native date-control differences. The full Windows suite passed all 801 tests. |
| Windows packaged smoke | Built the NSIS installer and unpacked app on Windows 11 x64 at `fe975de`. At `3a50532`, three consecutive runs each passed all 19 Windows-applicable tests, including the disposable Phase 3 EF fixture, single instance, startup failures and crash recovery. The Linux `SIGSTOP` case was skipped. The renderer-crash test used software rendering because this VM's Basic Display Adapter stalled renderer exit notification. All seven `assets/icon.ico` frames matched the app and installer resources. The installer payload launched with the release fuses, including ASAR integrity, started the server under `ELECTRON_RUN_AS_NODE` and stopped it on quit. |
| Owner demo sign-off | Approved by the owner on 2026-11-19 against `158a00f`: demo, baselines, feature parity, data continuity and the accepted UI deviations above. WP24 may proceed. |
| WP24 cutover | Complete. Linux acceptance passed with the TypeScript-only build, including 801 workspace tests, 124 SQLite tests under Electron, and 20 packaged smoke tests under Xvfb. Both EF fixture files were retained. Windows verification for the cutover tree is covered by CI. |
| WP24 Windows acceptance | 2026-11-19 on Windows 11 x64 at `0c2fc631b5635f77a8a62475d7839a8a6735b5e0`. Frozen install, Chromium install, build, warning-free static check and NSIS packaging passed without invoking .NET. All 801 workspace tests passed, including Windows screenshot baselines. Both packaged smoke runs passed all 19 Windows-applicable tests, including the Phase 3 EF fixture, with one Linux-only skip per run. |


## Additional behavior at `legacy-final`

The [migration plan](MIGRATION.md#legacy-feature-port) assigns the remaining
parity work. Add TypeScript evidence as each package lands.

| Legacy behavior | Work package | Status |
| --- | --- | --- |
| Fresh schema, adoption of the final and intermediate EF schemas, pre-adoption backup and recovery | WP25 | TODO |
| Session undo and redo, labels, shortcuts, replay guards and draft protection | WP26 | TODO |
| Editable statuses linked to completion, reopen and checked row menus | WP27 | TODO |
| Numbered priority labels independent of rank, with archived-name reservation | WP28 | TODO |
| Scoped FTS5 search, field filters and result activation | WP29 | TODO |
| Text query syntax, stable choices, relative dates and parse errors | WP30 | TODO |
| Saved search creation, editing, reopening and Home list | WP31 | TODO |
| Month/week calendar, filters, overflow and item navigation | WP32 | TODO |
| Calendar drag and keyboard rescheduling | WP33 | TODO |
| Item drag, reorder, reparent and folder drop with keyboard equivalents | WP34 | TODO |
| Trash scopes, restore, permanent delete and empty | WP35 | TODO |
| Bounded Markdown description preview and external link policy | WP36 | TODO |
| Item link CRUD, search and draft persistence | WP37 | TODO |
| Recurring items, successor creation, skip and stop | WP38 | TODO |
| In-app reminders, settings, snooze, dismissal and missed delivery | WP39 | TODO |
| Native notifications, tray lifecycle and per-database instance activation | WP40 | TODO |
| Cross-platform installers, tagged release and data preservation | WP41 | TODO |
| About version, installed updates and start with the system | WP42 | TODO |
| Push back one day via context menu or shortcut | WP43 | TODO |
| Today view with completed branches and local-day rollover | WP44 | TODO |
| Tickets view, filtering, drag order and cross-priority moves | WP45 | TODO |
| Priority-grouped workspace grid and card movement | WP46 | TODO |
| Checklist tray icon, current item and tray card | WP47 | TODO |
| Full and project JSON import/export with backup | WP48 | TODO |
| CSV project transfer and full search-results export | WP49 | TODO |
| Title bar, File/Edit/Project/View menus and return-page navigation | WP50 | TODO |
| Undo audit for settings, lookups, fields, new views and excluded writes | WP51 | TODO |
| Custom field type commit, empty time placeholders and settings cleanup | WP52 | TODO |
| Final fixture smoke, reviewed baselines and owner sign-off | WP53 | TODO |
